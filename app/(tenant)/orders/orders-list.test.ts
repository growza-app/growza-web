import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_CHIPS, EMPTY_QUERY, ORDERS_PAGE_SIZE, STATE_CHIPS, isFiltered, ordersHref, readQuery, stateChipOf, toSearch } from '../lib/orders-filter';
import { PAGE_SIZE } from '../components/Pagination';

/**
 * Jira GRW-614 — the Orders list: what a chip is, how a link round-trips, and the rules the screen must not break.
 *
 * The server does the filtering (BR-01), so most of this is pinned at the source: the screen asks the API for every
 * chip, every search and every page, and nothing in it narrows rows it already holds. The API half — 10,000 orders, the
 * statement count, the refusals — is the API repo's the-orders-list.integration.test.ts.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./OrdersClient.tsx');
const screen = here('./OrdersScreen.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../styles/99-orders.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../messages', `${lang}.json`), 'utf8')) as { orders: Record<string, any> };

describe('FR-03 — a chip is a request, and a link round-trips the filters', () => {
  it('reads what the server reads: channel, status, q and page', () => {
    expect(readQuery({ channel: 'flipkart', status: 'new,packed', q: 'Meera', page: '3' })).toEqual({ channel: 'flipkart', status: 'new,packed', q: 'Meera', customerId: '', page: 3 });
    expect(readQuery({})).toEqual(EMPTY_QUERY);
  });

  it('writes an unfiltered list as a clean address, and the same view as the same link', () => {
    expect(toSearch(EMPTY_QUERY)).toBe('');
    const q = { channel: 'amazon', status: 'sent', q: ' Meera ', customerId: '', page: 2 };
    expect(toSearch(q)).toBe('?channel=amazon&status=sent&q=Meera&page=2');
    expect(readQuery(Object.fromEntries(new URLSearchParams(toSearch(q)))).status).toBe('sent');
    // Page 1 is the default and stays out; so does a blank search.
    expect(toSearch({ ...EMPTY_QUERY, q: '   ', page: 1 })).toBe('');
  });

  it('forgives a link someone has edited — an unreadable page is page 1 — and leaves refusing to the server', () => {
    for (const page of ['0', '-3', 'abc', '1.5', '']) expect(readQuery({ page }).page, page).toBe(1);
    // An unknown state is NOT quietly dropped here: it goes to the API, which refuses it with a sentence (AC-02).
    expect(readQuery({ status: 'dispatched' }).status).toBe('dispatched');
  });

  it('"to send" is new AND packed — the one job, not two filters', () => {
    expect(STATE_CHIPS[0]).toEqual({ key: 'toSend', value: 'new,packed' });
    expect(stateChipOf('new,packed')).toBe('toSend');
    expect(stateChipOf('sent')).toBe('sent');
    expect(stateChipOf('packed,new'), 'a combination no chip stands for').toBeNull();
  });

  it('Home can link INTO a filtered list (FR-06)', () => {
    expect(ordersHref({ status: 'new,packed' })).toBe('/orders?status=new%2Cpacked');
    expect(ordersHref({})).toBe('/orders');
    expect(ordersHref({ channel: 'flipkart', status: 'new,packed' })).toContain('channel=flipkart');
  });

  it('which empty message is true is decided by whether anything narrows the list', () => {
    expect(isFiltered(EMPTY_QUERY)).toBe(false);
    expect(isFiltered({ ...EMPTY_QUERY, q: '   ' }), 'a blank box narrows nothing').toBe(false);
    expect(isFiltered({ ...EMPTY_QUERY, channel: 'amazon' })).toBe(true);
    expect(isFiltered({ ...EMPTY_QUERY, status: 'sent' })).toBe(true);
    expect(isFiltered({ ...EMPTY_QUERY, q: 'x' })).toBe(true);
  });
});

describe('BR-01 / NFR-02 — the SERVER filters, searches and pages; the browser narrows nothing', () => {
  it('asks the API for every chip, search and page, with the API’s own values', () => {
    expect(client).toMatch(/\.orders\(\{ channel: q\.channel, status: q\.status, q: q\.q\.trim\(\), customerId: q\.customerId, page: q\.page, pageSize: ORDERS_PAGE_SIZE, location \}\)/);
    expect(screen).toContain('api.orders({ channel: query.channel, status: query.status, q: query.q.trim(), customerId: query.customerId, page: query.page, pageSize: ORDERS_PAGE_SIZE })');
  });

  it('never filters, sorts or slices the rows it was given', () => {
    // The only `rows` it touches are the page it was handed, drawn as it came. `.some()` asks a question; it does not narrow.
    expect(client).not.toMatch(/rows\s*\.\s*(filter|sort|slice|reduce)\(/);
    expect(client).not.toMatch(/page\.rows\s*\.\s*(filter|sort|slice)\(/);
    expect(client).not.toMatch(/\.localeCompare\(/);
  });

  it('the page size is the shared ten, read the same way by the server and the client', () => {
    expect(ORDERS_PAGE_SIZE).toBe(PAGE_SIZE);
    expect(client).toContain('<Pagination page={query.page} total={page.total} pageSize={ORDERS_PAGE_SIZE}');
  });

  it('a slower, older answer never overwrites a newer one', () => {
    expect(client).toContain('if (mine !== requestId.current) return;');
    expect(client).toContain('const mine = ++requestId.current;');
  });

  it('typing is debounced and a term too short is not sent — but an empty box is "every order" and is', () => {
    expect(client).toContain('SEARCH_DEBOUNCE_MS');
    expect(client).toContain('if (!worthSearching(typed)) return;');
  });
});

describe('FR-03 — chips push, typing and paging replace, so Back undoes a filter and not a keystroke', () => {
  it('a chip pushes; the search and the page replace', () => {
    expect(client).toContain("go({ ...query, channel, page: 1 }, 'push')");
    expect(client).toContain("go({ ...query, status, page: 1 }, 'push')");
    expect(client).toContain("go({ ...query, page: p }, 'replace')");
    expect(client).toContain('window.history.replaceState(null');
  });

  it('Back and Forward re-read the address, so the screen never shows a filter the address no longer holds', () => {
    expect(client).toContain("window.addEventListener('popstate', onPop)");
  });
});

describe('UI states — loading, empty (two different ones), error', () => {
  it('a skeleton reserves a card’s height, and the rows dim rather than collapse while a page is read', () => {
    expect(client).toContain('ord-card-skel');
    expect(css).toMatch(/\.ord-card-skel\s*\{[^}]*min-height:\s*5\.5rem/);
    expect(css).toMatch(/\.ord\[aria-busy='true'\] \.ord-cards/);
    expect(client).toContain('aria-busy={loading || undefined}');
  });

  it('"No orders yet" and "Nothing matches that" are different messages, and only the second offers to clear', () => {
    // Three now: a list scoped to one client says so in its own words rather than the shop's "your first sale".
    expect(client).toContain("filtered ? t('list.noMatch.title') : query.customerId ? t('list.clientEmpty.title') : t('list.empty.title')");
    expect(client).toContain("filtered ? (\n            <button type=\"button\" className=\"btn\" onClick={clearAll}>");
  });

  it('an error is one plain line with a retry that asks again for the SAME filters', () => {
    expect(client).toContain("role=\"alert\"");
    expect(client).toContain('onClick={() => load(query, branch)}');
  });

  it('a failed first read is not a failed screen: the client is handed null and shows the retry', () => {
    expect(screen).toContain(".catch((error: unknown) => ({");
    expect(screen).toContain("initial={'rows' in initial ? initial : null}");
  });
});

describe('FR-06 — Home’s count of what is waiting opens the list already filtered to it', () => {
  const home = readFileSync(path.resolve(import.meta.dirname, '../components/home/ShopHome.tsx'), 'utf8');

  it('links "N to send" into the Orders list with the same two states the chip filters to', () => {
    expect(home).toContain("href={ordersHref({ status: 'new,packed' })}");
    // …which is the To send chip's own value, so the number on Home and the rows behind it cannot disagree.
    expect(STATE_CHIPS.find((c) => c.key === 'toSend')!.value).toBe('new,packed');
    expect(ordersHref({ status: 'new,packed' })).toBe('/orders?status=new%2Cpacked');
  });

  it('draws nothing when nothing is waiting: a "0 to send" is noise on the screen opened most', () => {
    expect(home).toContain('{data.toSend > 0 ? (');
  });

  it('says it in both languages', () => {
    const copy = readFileSync(path.resolve(import.meta.dirname, '../lib/home-copy.ts'), 'utf8');
    expect(copy).toContain("toSend: (n: number) => S(`${n} to send`, `${n} भेजने हैं`)");
  });
});

describe('BR-03 — a front desk without the sales tab is sent no amounts, so none are drawn', () => {
  it('the amount appears only where a row carries one', () => {
    expect(client).toContain('const showMoney = rows.some((r) => r.amountMinor !== undefined);');
    expect(client).toContain('r.amountMinor !== undefined ? <span className="ord-amount">');
    expect(client).toContain('{showMoney ? <th className="ord-num">');
  });
});

describe('UX — 344px first, one accent, plain words, the shared parts', () => {
  it('uses the shared Pagination and the shared search ×, and writes no second of either', () => {
    expect(client).toContain("from '../components/Pagination'");
    expect(client).toContain("from '../components/SearchClear'");
    expect(client).toContain('<SearchClear');
  });

  it('every chip is at least 2.75rem tall, and the chips wrap instead of scrolling sideways', () => {
    expect(css).toMatch(/\.ord-chip\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.ord-chips\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('cards first, the table from 861px — the same switch Bookings and Sales make', () => {
    expect(css).toMatch(/\.ord-table\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/@media \(min-width: 861px\)\s*\{[\s\S]*\.ord-table\s*\{\s*display:\s*table/);
  });

  it('type is in rem, never a px font-size; no animation anywhere on the screen', () => {
    expect(css).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/transition|animation|@keyframes/);
  });

  it('the state chips use the system’s tokens, not a one-off colour', () => {
    const colours = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    // The one literal is the white on the selected chip, which every chip in the product uses.
    expect(colours.filter((c) => c !== '#fff')).toEqual([]);
  });

  it('no emoji, and no icon set but the inline SVGs already here', () => {
    expect(client).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(client).toContain("from '../components/icons'");
  });
});

describe('UX-07 — every word is in both languages, and a state or channel this build has no word for is still shown', () => {
  for (const lang of ['en', 'hi'] as const) {
    it(`${lang}: the list carries every string the screen asks for`, () => {
      const list = messages(lang).orders.list;
      for (const key of ['searchPlaceholder', 'searchLabel', 'channelGroup', 'stateGroup', 'allChannels', 'allStates', 'itemCount', 'orderCode', 'noName', 'unknownState', 'nounOrders']) {
        expect(list[key], `${lang} list.${key}`).toBeTruthy();
      }
      expect(Object.keys(list.stateChips).sort()).toEqual(STATE_CHIPS.map((c) => c.key).sort());
      expect(Object.keys(list.cols).sort()).toEqual(['amount', 'from', 'items', 'state', 'when', 'who']);
      for (const group of ['empty', 'noMatch', 'error']) expect(Object.keys(list[group]).length, `${lang} ${group}`).toBeGreaterThan(0);
      for (const chip of CHANNEL_CHIPS) expect(messages(lang).orders.channels[chip], chip).toBeTruthy();
    });
  }

  it('the Hindi is Hindi, and the English never says "customer" or "SKU"', () => {
    const hi = JSON.stringify(messages('hi').orders.list);
    expect(hi).toMatch(/[ऀ-ॿ]/);
    expect(JSON.stringify(messages('en').orders.list)).not.toMatch(/customer|sku|variant|rto/i);
  });

  it('the list asks the typed lookups for its words, and falls back to the data for a channel it has no word for', () => {
    expect(client).toContain('stateWords[status as keyof typeof stateWords] ?? t(\'list.unknownState\')');
    expect(client).toContain('channelWords[c as keyof typeof channelWords] ?? c');
  });
});
