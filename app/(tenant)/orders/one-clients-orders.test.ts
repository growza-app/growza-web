import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMPTY_QUERY, isFiltered, readQuery, toSearch } from '../lib/orders-filter';

/**
 * Owner, 2026-10-28 — the Orders list, narrowed to one client by their card's "See orders".
 *
 * A SCOPE, not a chip: the chips and the search narrow within it, and clearing them leaves you looking at the same
 * person. Only the banner's "Show all orders" lets them go. These cases pin that distinction, because the cheap way
 * to build this — one more value in the filter card — is the way that makes "Clear" silently change who you are
 * looking at.
 */
const ID = '385e33a2-06aa-4cf9-913f-86ed676f60c4';

describe('one client’s orders', () => {
  it('rides the address bar, so the list can be linked to and bookmarked', () => {
    expect(readQuery({ customerId: ID }).customerId).toBe(ID);
    expect(toSearch({ ...EMPTY_QUERY, customerId: ID })).toBe(`?customerId=${ID}`);
  });

  it('round-trips with the filters beside it', () => {
    const q = { ...EMPTY_QUERY, channel: 'counter', status: 'new,packed', customerId: ID, page: 2 };
    expect(readQuery(Object.fromEntries(new URLSearchParams(toSearch(q))))).toEqual(q);
  });

  it('drops a hand-edited id rather than sending the API something it would refuse', () => {
    for (const bad of ['abc', '385e33a2', `${ID}x`, '']) expect(readQuery({ customerId: bad }).customerId, bad).toBe('');
  });

  it('lowers an id in capitals, so one person is one scope', () => {
    expect(readQuery({ customerId: ID.toUpperCase() }).customerId).toBe(ID);
  });

  it('is not a filter: a client alone leaves the list reading as unfiltered', () => {
    expect(isFiltered({ ...EMPTY_QUERY, customerId: ID })).toBe(false);
    expect(isFiltered({ ...EMPTY_QUERY, customerId: ID, status: 'sent' })).toBe(true);
  });

  it('survives Clear, which drops the chips and the search and not the person', () => {
    const client = readFileSync(join(process.cwd(), 'app/(tenant)/orders/OrdersClient.tsx'), 'utf8');
    expect(client).toContain('{ ...EMPTY_QUERY, customerId: query.customerId }');
  });

  it('goes to the server, which is the only thing that narrows a list here (BR-01)', () => {
    const client = readFileSync(join(process.cwd(), 'app/(tenant)/orders/OrdersClient.tsx'), 'utf8');
    const screen = readFileSync(join(process.cwd(), 'app/(tenant)/orders/OrdersScreen.tsx'), 'utf8');
    expect(client).toContain('customerId: q.customerId');
    expect(screen).toContain('customerId: query.customerId');
  });

  it('says whose orders these are, and how to get back out', () => {
    const client = readFileSync(join(process.cwd(), 'app/(tenant)/orders/OrdersClient.tsx'), 'utf8');
    expect(client).toContain('list.clientShowing');
    expect(client).toContain('href="/orders"');
  });

  /*
   * Found by testing it, 2026-10-28: with the name read off the rows, the banner over an EMPTY list said "Orders for
   * this client" — it lost the name at the one moment the banner is the only thing on screen saying what you are
   * looking at. The API sends the name beside the page for exactly that case.
   */
  it('names the client from the page, not from a row that may not be there', () => {
    const client = readFileSync(join(process.cwd(), 'app/(tenant)/orders/OrdersClient.tsx'), 'utf8');
    expect(client).toContain("page?.client?.name?.trim() || rows[0]?.who?.name?.trim() || t('list.thisClient')");
  });

  it('does not tell one client their order will be the shop\u2019s first sale', () => {
    const client = readFileSync(join(process.cwd(), 'app/(tenant)/orders/OrdersClient.tsx'), 'utf8');
    expect(client).toContain("query.customerId ? t('list.clientEmpty.title')");
    const en = JSON.parse(readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8'));
    expect(en.orders.list.clientEmpty.body).not.toContain('Your first');
    const hi = JSON.parse(readFileSync(join(process.cwd(), 'messages/hi.json'), 'utf8'));
    expect(hi.orders.list.clientEmpty.title.trim()).not.toBe('');
    expect(hi.orders.list.clientShowing).toContain('{name}');
  });
});
