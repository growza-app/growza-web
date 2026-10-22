/**
 * Jira GRW-614 — what the Orders list is filtered by, and how that rides the address bar.
 *
 * Pure, so the screen and its tests share ONE definition of a chip and of a link. The filtering itself is the SERVER's
 * (BR-01): nothing here narrows a list of rows; it only turns a chip into the query the API understands and back.
 *
 * The values are the API's own — `new,packed` for "to send", not a word invented here — because the same address is
 * read by the server component on arrival and is what Home links into (FR-06).
 */

/** Channels a chip is offered for. The words live in `messages/*.json` under `orders.channels`. */
export const CHANNEL_CHIPS = ['counter', 'flipkart', 'amazon'] as const;
export type ChannelChip = (typeof CHANNEL_CHIPS)[number];

/**
 * The state chips, in the order a shopkeeper works through an order's life. `value` is what goes to the API.
 *
 * "To send" is two states, new and packed: they are the same job to a person with a parcel in their hand ("it has not
 * gone yet"), and splitting them would make the one list they actually open all day a choice between two.
 */
export const STATE_CHIPS = [
  { key: 'toSend', value: 'new,packed' },
  { key: 'sent', value: 'sent' },
  { key: 'delivered', value: 'delivered' },
  { key: 'cancelled', value: 'cancelled' },
  { key: 'returned', value: 'returned' },
] as const;
export type StateChipKey = (typeof STATE_CHIPS)[number]['key'];

export interface OrdersQuery {
  /** The API value, or '' for every channel. */
  channel: string;
  /** The API value, or '' for every state. */
  status: string;
  /** What is typed in the box. */
  q: string;
  /** 1-based. */
  page: number;
}

/**
 * Rows per page. The same ten every other server-paged list uses (`PAGE_SIZE` in components/Pagination.tsx); declared
 * here because the SERVER component reads the first page and cannot import a constant out of a client module. A test
 * pins the two equal.
 */
export const ORDERS_PAGE_SIZE = 10;

/** Every state this build has a word for. Anything else is shown as "Unknown" and never crashes the list. */
export const KNOWN_STATES = ['done', 'new', 'packed', 'sent', 'delivered', 'cancelled', 'returned'] as const;

export const EMPTY_QUERY: OrdersQuery = { channel: '', status: '', q: '', page: 1 };

/** The chip a status value belongs to, or null when it is a combination no chip stands for (a hand-edited link). */
export function stateChipOf(status: string): StateChipKey | null {
  return STATE_CHIPS.find((c) => c.value === status)?.key ?? null;
}

/** Is any narrowing in force? Decides which empty message is true ("no orders yet" vs "nothing matches that"). */
export const isFiltered = (query: OrdersQuery): boolean => query.channel !== '' || query.status !== '' || query.q.trim() !== '';

/**
 * Read the address bar (or a server component's `searchParams`).
 *
 * Forgiving on the way IN — an unreadable page is page 1 — because the SERVER is the one that refuses an unknown
 * channel or state, with a sentence; this only has to not crash on a link someone has edited.
 */
export function readQuery(raw: { channel?: string | string[]; status?: string | string[]; q?: string | string[]; page?: string | string[] }): OrdersQuery {
  const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));
  const page = Number(one(raw.page));
  return {
    channel: one(raw.channel).trim(),
    status: one(raw.status).trim(),
    q: one(raw.q),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/**
 * The query string for the address bar. Defaults are left out so an unfiltered list has a clean address, and the
 * order is fixed so the same view always makes the same link.
 */
export function toSearch(query: OrdersQuery): string {
  const params = new URLSearchParams();
  if (query.channel) params.set('channel', query.channel);
  if (query.status) params.set('status', query.status);
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.page > 1) params.set('page', String(query.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** A link into the list, already filtered — what Home's counts use (FR-06). */
export const ordersHref = (query: Partial<OrdersQuery>, base = '/orders'): string => `${base}${toSearch({ ...EMPTY_QUERY, ...query })}`;
