/**
 * Jira GRW-140 · GRW-212 — the paging model for the admin list screens.
 *
 * ## What was wrong
 *
 * Every admin list sent an ACCUMULATING PREFIX: `page=1` with
 * `pageSize = currentPage * pageSize`, so the server returned everything from
 * row 1 up to the current window and mobile's "Load more" could append rather
 * than replace.
 *
 * `src/platform/paging.ts` clamps `pageSize` to `MAX_PAGE_SIZE` (100). At the
 * default 20 a page 6 asks for 120 and receives 100, so pages 6, 7 and 8 all
 * return the same hundred rows, "Next" stays enabled and does nothing, and the
 * 101st row is unreachable through the UI. Choosing 100 rows per page breaks
 * it at page 2.
 *
 * ## The actual bug
 *
 * Not arithmetic — ONE CONTROL SERVING TWO INTERACTIONS. Desktop's numbered
 * pager REPLACES what is on screen; mobile's "Load more" APPENDS to it. The old
 * design expressed the difference in the REQUEST, which is the one place it
 * cannot live: a request that accumulates has to grow past any server cap,
 * and then the cap decides what the reader sees.
 *
 * So the intent moves into the state. The request is always one honest page —
 * `pageSize` never exceeds what a reader picked, so the server clamp can never
 * bind — and ACCUMULATION BECOMES A CLIENT CONCERN: `mergeRows` appends or
 * replaces according to which control was pressed.
 *
 * That is also why nothing here needs a `maxRows` escape hatch. Its copy
 * ("narrow with filters to reach the rest past 100") was an honest description
 * of a list that could not be paged; with real offset paging there is no rest
 * to reach.
 */

/** Which interaction produced this page — the thing the old design could not say. */
export type PageIntent = 'replace' | 'append';

export interface PagingState {
  page: number;
  pageSize: number;
  /**
   * `replace` for the desktop pager and any page-size change, `append` for
   * mobile's "Load more". Read by `mergeRows` and by the row-count label.
   */
  intent: PageIntent;
}

/** What actually goes on the wire: one page, never a prefix. */
export interface PageRequest {
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [20, 50, 100];

/**
 * `MAX_PAGE_SIZE` in `src/platform/paging.ts`. Not used to cap anything here —
 * every option above is already within it, which is the point. It is asserted
 * against in the tests so that raising an option past the server's ceiling
 * fails loudly instead of silently truncating a page.
 */
export const SERVER_MAX_PAGE_SIZE = 100;

export const INITIAL_PAGING: PagingState = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  intent: 'replace',
};

/**
 * The request for a given state. Deliberately NOT `page * pageSize` — that
 * multiplication is the whole defect.
 */
export function pageRequest(state: PagingState): PageRequest {
  const pageSize = Math.min(Math.max(Math.trunc(state.pageSize) || DEFAULT_PAGE_SIZE, 1), SERVER_MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(state.page) || 1, 1);
  return { page, pageSize };
}

/** Query-string form, so six screens cannot spell the two parameters six ways. */
export function applyPageParams(params: URLSearchParams, state: PagingState): void {
  const { page, pageSize } = pageRequest(state);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
}

/**
 * The rows to render after a fetch.
 *
 * `append` is mobile's "Load more" and is the only case that keeps what came
 * before. Everything else — a numbered page, a page-size change, a filter —
 * replaces, because showing page 3 above rows 1-60 was the visible half of
 * this bug.
 */
export function mergeRows<T>(previous: readonly T[], incoming: readonly T[], intent: PageIntent): T[] {
  return intent === 'append' ? [...previous, ...incoming] : [...incoming];
}

/**
 * Admin audit 2026-10-09, M13 — the state to reload a list in after a save changed it: page 1, replacing.
 *
 * Refetching with the state as it was (`{ ...p }`) kept `append` after a "Load more", so the page was fetched again
 * and added again — every row on it twice — and a new row, which sorts first, was not on that page at all. A save
 * can move rows across pages, so the only page that is certainly right afterwards is the first, on its own. Always
 * a new object, so the list's effect runs even when it was already on page 1.
 */
export function reloadFromFirstPage<S extends PagingState>(state: S): S {
  return { ...state, page: 1, intent: 'replace' };
}

export function totalPages(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
}

/**
 * A page that no longer exists after a filter narrowed the result set.
 *
 * The screens reset to page 1 whenever a filter changes, so this is the second
 * line rather than the first — but a stale page surviving into a request is
 * how an admin ends up looking at an empty page 4 of 1 (AC-03).
 */
export function clampPage(state: PagingState, total: number): PagingState {
  const last = totalPages(total, state.pageSize);
  return state.page <= last ? state : { ...state, page: last, intent: 'replace' };
}

export interface RowWindow {
  /** 1-based index of the first row on screen. */
  from: number;
  /** 1-based index of the last row on screen. */
  to: number;
}

/**
 * Which rows are actually rendered — the honest answer FR-02 asks for.
 *
 * After `append` the buffer runs from row 1, because every page since the last
 * replace is still on screen. After `replace` it starts at this page's offset.
 * `null` when nothing is rendered, so a caller cannot print "Showing 1-0".
 */
export function rowWindow(state: PagingState, loaded: number): RowWindow | null {
  if (loaded <= 0) return null;
  const { page, pageSize } = pageRequest(state);
  const from = state.intent === 'append' ? 1 : (page - 1) * pageSize + 1;
  return { from, to: from + loaded - 1 };
}

/** "Showing 41–60 of 250". Uses an en dash, not a hyphen. */
export function showingLabel(state: PagingState, loaded: number, total: number): string {
  const window = rowWindow(state, loaded);
  const of = `of ${total.toLocaleString('en-IN')}`;
  if (!window) return `Showing 0 ${of}`;
  const span =
    window.from === window.to
      ? window.from.toLocaleString('en-IN')
      : `${window.from.toLocaleString('en-IN')}–${window.to.toLocaleString('en-IN')}`;
  return `Showing ${span} ${of}`;
}

/**
 * Whether "Load more" has anything left to load.
 *
 * Keyed on the LAST ROW ON SCREEN rather than on a row count, so it is still
 * right after a desktop reader pages forward and then narrows the window: the
 * question is "is there anything past what I can see", and past row 60 of 250
 * there is, whichever control put row 60 there.
 */
export function hasMore(state: PagingState, loaded: number, total: number): boolean {
  const window = rowWindow(state, loaded);
  return window ? window.to < total : total > 0;
}

/** The desktop pager's step. Always a replace — it moves a window, it does not grow one. */
export function goToPage(state: PagingState, page: number, total: number): PagingState {
  const last = totalPages(total, state.pageSize);
  return { ...state, page: Math.min(Math.max(1, Math.trunc(page) || 1), last), intent: 'replace' };
}

/** Mobile's "Load more": the next page, kept on screen alongside this one. */
export function loadMore(state: PagingState): PagingState {
  return { ...state, page: state.page + 1, intent: 'append' };
}

/**
 * A new page size starts again at page 1 — row 47 is on a different page at 20
 * per page than at 50, so keeping the number would move the reader somewhere
 * they did not ask to go.
 */
export function changePageSize(pageSize: number): PagingState {
  return { page: 1, pageSize, intent: 'replace' };
}
