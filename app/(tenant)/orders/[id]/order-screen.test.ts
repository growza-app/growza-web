import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-615 — an order's own screen, pinned at the source.
 *
 * The behaviour that matters most — a stale tap refused with a sentence, a double tap moving the order once, the bar
 * standing on the nav — was checked in a browser at 344px (see the PR). These keep the rules from drifting: above all
 * BR-01, that the screen offers only what the API sent and never decides what can follow what.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./OrderClient.tsx');
const page = here('./page.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-orders.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')) as { orders: Record<string, any> };

describe('BR-01 — the screen never invents a move; it offers what the API sent', () => {
  it('reads the primary move and the rest from `order.moves`, and has no table of what can follow what', () => {
    expect(client).toContain('order.moves.primary');
    expect(client).toContain('order.moves.more');
    // No state-to-state transitions anywhere in the screen: not "new → packed", not an ordered list of states.
    expect(client).not.toMatch(/new['"]?\s*:\s*['"]packed/);
    expect(client).not.toMatch(/ORDER_STATE_MOVES|ORDER_PRIMARY_MOVE|mayMove|movesFrom|movesOffered/);
    expect(client).not.toMatch(/\['new',\s*'packed'/);
  });

  it('offers a move only if it has a word for it — a state the API adds later is never drawn as a blank button', () => {
    expect(client).toContain('moveWords[order.moves.primary] !== undefined');
    expect(client).toContain('order.moves.more.filter((m) => moveWords[m] !== undefined)');
  });

  it('the one next move is the big button, and the rarer ones are behind a quiet More', () => {
    expect(client).toContain('className="btn btn-primary ord-d-primary"');
    expect(client).toContain('aria-haspopup="menu"');
    expect(client).toMatch(/className="btn ord-d-more-btn"/);
  });
});

describe('AC-02 — a move that has already happened elsewhere', () => {
  it('sends the state this screen BELIEVES the order is in, so a stale tap is refused instead of overwriting', () => {
    expect(client).toContain('api.moveOrder(order.id, to, order.status, extra)');
  });

  it('on a refusal says where the order is NOW, and redraws from the truth', () => {
    expect(client).toContain("error.code === 'move_not_allowed'");
    expect(client).toContain("setNotice(t('detail.movedOn', { state: stateWord(now) }))");
    expect(client).toMatch(/setNotice\(t\('detail\.movedOn'[\s\S]*?await refresh\(\)/);
  });

  it('a double tap moves the order once: a REF is the guard, because state is stale until the next render', () => {
    expect(client).toContain('const inFlight = useRef(false);');
    expect(client).toContain('if (!order || inFlight.current) return;');
    expect(client).toContain('inFlight.current = false;');
    // …and the button is also disabled while a request is out, for the person looking at it.
    expect(client).toMatch(/className="btn btn-primary ord-d-primary" disabled=\{busy\}/);
  });
});

describe('AC-03 — a cancelled order offers nothing; a counter sale offers the receipt and the existing return', () => {
  it('draws no bar at all when there is nothing to offer', () => {
    expect(client).toContain('const hasBar = offerPrimary || more.length > 0;');
    expect(client).toContain('{hasBar ? (\n          <div className="ord-d-bar">');
  });

  it('a counter sale reaches the EXISTING return sheet and receipt — nothing is copied', () => {
    expect(client).toContain("from '../../sales/ReturnProductSheet'");
    expect(client).toContain("from '../../components/DocumentAction'");
    expect(client).toContain('<ReturnProductSheet');
    expect(client).toContain('<DocumentAction visitKey={order.id} />');
  });

  it('the return is offered only for the counter, and only where the prices are known (a desk without the sales tab has none)', () => {
    expect(client).toContain("isCounter && hasMoney && order.lines.every((l) => l.priceMinor !== undefined)");
    expect(client).toContain('returnable && writable');
  });
});

describe('BR-03 / money — drawn only where it was sent', () => {
  it('the money block, and each line’s amount, exist only when the API sent them', () => {
    expect(client).toContain('const hasMoney = order.totalMinor !== undefined;');
    expect(client).toContain('{hasMoney ? (');
    expect(client).toContain('l.paidMinor !== undefined ?');
  });

  it('a state that is not writable (a business suspended for non-payment) is read, and moves nothing', () => {
    expect(client).toContain('const offerPrimary = writable &&');
    expect(client).toContain('const more = writable ?');
  });
});

describe('FR-04 / UI states — who it is for, and the plain lines', () => {
  it('a buyer is "Buyer" with the note that they are not in the client list; a client is "Client"', () => {
    // The client's heading is the business's own word (Guest, Customer) — Restaurant QA 2026-10-24.
    expect(client).toContain("order.client ? t('detail.client', { customer: nouns.Customer }) : t('buyer.title')");
    expect(client).toContain("t('buyer.notAClient')");
  });

  it('an online order still to send with no address says it cannot be sent yet', () => {
    expect(client).toContain("order.status === 'new' || order.status === 'packed'");
    expect(client).toContain("t('detail.noAddress')");
  });

  it('a buyer whose details were removed says so; an order with no lines says that is a bug', () => {
    expect(client).toContain("t('detail.detailsRemoved')");
    expect(client).toContain("t('detail.noLines')");
  });

  it('a failed read is a retry, not a blank page; a missing order is a sentence with a way back', () => {
    expect(client).toContain("t('detail.loadError')");
    expect(client).toContain('onClick={() => void refresh()}');
    expect(page).toContain("error.status === 404");
    expect(page).toContain("t('detail.notFound')");
    expect(page).toContain("t('detail.backToOrders')");
  });

  it('is guarded like the list it is reached from', () => {
    expect(page).toContain("await guardScreen('/orders');");
  });
});

describe('UX — 344px first, one accent, nothing animates', () => {
  it('the bar stands on the scroller’s bottom edge: it pins at 0 and the screen gives up the padding the nav needed', () => {
    expect(css).toMatch(/\.ord-d-bar\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/);
    expect(css).toMatch(/\.ord-detail\.has-bar\s*\{\s*padding-bottom:\s*0;/);
  });

  it('the primary button and every row a thumb meets are at least 2.75rem tall', () => {
    expect(css).toMatch(/\.ord-d-primary\s*\{[^}]*min-height:\s*3rem/);
    expect(css).toMatch(/\.ord-d-more-item\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.ord-d-lines li\s*\{[^}]*min-height:\s*2\.75rem/);
  });

  it('no px font-size, no animation, no literal colour beyond the white of a selected chip', () => {
    expect(css).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect([...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()).filter((c) => c !== '#fff')).toEqual([]);
  });

  it('the money, address and history use plain words from the messages, never a code', () => {
    expect(client).not.toMatch(/>\s*(variant|SKU|RTO)\s*</i);
    expect(client).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('UX-07 — every word of the screen is in both languages', () => {
  const used = [...client.matchAll(/t\('detail\.([\w.]+)'/g)].map((m) => m[1]!);
  const moves = ['packed', 'sent', 'delivered', 'cancelled', 'returned'];

  for (const lang of ['en', 'hi'] as const) {
    it(`${lang}: every detail.* string the screen and its page ask for exists`, () => {
      const detail = messages(lang).orders.detail;
      for (const key of [...new Set([...used, ...['loadError', 'notFound', 'backToOrders']])]) {
        const value = key.split('.').reduce((o: any, k) => o?.[k], detail);
        expect(value, `${lang} detail.${key}`).toBeTruthy();
      }
      for (const m of moves) expect(detail.moves[m], `${lang} moves.${m}`).toBeTruthy();
      for (const mode of ['cash', 'card', 'upi', 'other']) expect(detail.modes[mode], `${lang} modes.${mode}`).toBeTruthy();
    });
  }

  it('the Hindi is Hindi; the English says "Mark as sent" and never a code', () => {
    expect(JSON.stringify(messages('hi').orders.detail)).toMatch(/[ऀ-ॿ]/);
    expect(messages('en').orders.detail.moves).toMatchObject({ packed: 'Mark as packed', sent: 'Mark as sent', delivered: 'Mark as delivered' });
    expect(JSON.stringify(messages('en').orders.detail)).not.toMatch(/variant|sku\b|rto\b/i);
  });
});

describe('the list opens it', () => {
  const list = readFileSync(path.resolve(import.meta.dirname, '../OrdersClient.tsx'), 'utf8');
  it('a card is a link to the order, and so is the date in the table', () => {
    expect(list).toContain('href={`/orders/${r.id}`}');
    expect(list.match(/href=\{`\/orders\/\$\{r\.id\}`\}/g)).toHaveLength(2);
  });
});
