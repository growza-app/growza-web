import { describe, expect, it } from 'vitest';
import { MAX_PAGE_SIZE } from '@growza-app/shared';
import {
  DEFAULT_PAGE_SIZE,
  INITIAL_PAGING,
  PAGE_SIZE_OPTIONS,
  SERVER_MAX_PAGE_SIZE,
  applyPageParams,
  changePageSize,
  clampPage,
  goToPage,
  hasMore,
  loadMore,
  mergeRows,
  pageRequest,
  rowWindow,
  showingLabel,
  totalPages,
  type PagingState,
} from './paging';

/**
 * Jira GRW-140 · GRW-212 — paging that reaches past the hundredth row.
 *
 * The card records that the absence of a fixture with more than 100 rows is
 * why this shipped. Every scenario below is therefore sized past the clamp:
 * 250 rows, the same number the acceptance criteria use.
 */

const TOTAL = 250;

/** The state a screen is in after N presses of a control, from a fresh mount. */
function pagesForward(count: number, pageSize = DEFAULT_PAGE_SIZE): PagingState {
  let state: PagingState = { ...INITIAL_PAGING, pageSize };
  for (let i = 0; i < count; i += 1) state = goToPage(state, state.page + 1, TOTAL);
  return state;
}

/** What the server would return for a request, given a result set of `total` rows. */
function serverRows(state: PagingState, total = TOTAL): number[] {
  const { page, pageSize } = pageRequest(state);
  // Mirrors src/platform/paging.ts: the server clamps pageSize and offsets by page.
  const safe = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  const offset = (page - 1) * safe;
  return Array.from({ length: total }, (_, i) => i + 1).slice(offset, offset + safe);
}

describe('the request shape', () => {
  it('asks for one page, never an accumulating prefix', () => {
    // The defect in one assertion: page 6 at 20 per page used to ask for 120.
    expect(pageRequest(pagesForward(5))).toEqual({ page: 6, pageSize: 20 });
  });

  it('never asks for more rows than the server will return', () => {
    for (const pageSize of PAGE_SIZE_OPTIONS) {
      for (const page of [1, 2, 6, 13, 400]) {
        expect(pageRequest({ page, pageSize, intent: 'replace' }).pageSize).toBeLessThanOrEqual(MAX_PAGE_SIZE);
      }
    }
  });

  it('agrees with the server about its own ceiling', () => {
    // If these ever diverge, a page silently returns fewer rows than asked for
    // and "Next" starts lying again — the original defect, one layer down.
    expect(SERVER_MAX_PAGE_SIZE).toBe(MAX_PAGE_SIZE);
    expect(Math.max(...PAGE_SIZE_OPTIONS)).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('writes both parameters onto the query string', () => {
    const params = new URLSearchParams();
    applyPageParams(params, pagesForward(5));
    expect(params.get('page')).toBe('6');
    expect(params.get('pageSize')).toBe('20');
  });
});

describe('AC-01 — the hundred-and-first row is reachable', () => {
  it('gives each page the next distinct twenty businesses', () => {
    const seen = new Set<number>();
    let state: PagingState = { ...INITIAL_PAGING };
    for (let page = 1; page <= totalPages(TOTAL, DEFAULT_PAGE_SIZE); page += 1) {
      const rows = serverRows(state);
      // No page repeats a row it has already shown — pages 6, 7 and 8 used to
      // return the identical hundred rows.
      for (const row of rows) expect(seen.has(row)).toBe(false);
      for (const row of rows) seen.add(row);
      state = goToPage(state, state.page + 1, TOTAL);
    }
    expect(seen.size).toBe(TOTAL);
  });

  it('reaches the 101st, 150th and 250th rows', () => {
    // Page 6 at 20 per page is where the old accumulating prefix first hit the
    // clamp, and 101 is the row that was unreachable through the UI entirely.
    expect(serverRows(pagesForward(5))).toContain(101);
    expect(serverRows(pagesForward(7))).toContain(150);
    expect(serverRows(pagesForward(12))).toContain(250);
  });

  it('stops at the last page rather than paging into nothing', () => {
    const last = pagesForward(50); // far more presses than there are pages
    expect(last.page).toBe(13);
    expect(serverRows(last)).toEqual([241, 242, 243, 244, 245, 246, 247, 248, 249, 250]);
  });
});

describe('AC-02 — the largest page size does not break at page 2', () => {
  it('shows rows 101–200 and then 201–250', () => {
    const page2 = pagesForward(1, 100);
    const page3 = pagesForward(2, 100);
    expect(serverRows(page2)[0]).toBe(101);
    expect(serverRows(page2).at(-1)).toBe(200);
    expect(serverRows(page3)[0]).toBe(201);
    expect(serverRows(page3).at(-1)).toBe(250);
  });

  it('disables Next on the last page', () => {
    const page3 = pagesForward(2, 100);
    expect(totalPages(TOTAL, 100)).toBe(3);
    expect(page3.page).toBe(3);
    // "Next" is disabled when page >= totalPages; goToPage cannot move past it.
    expect(goToPage(page3, 4, TOTAL).page).toBe(3);
    expect(hasMore(page3, serverRows(page3).length, TOTAL)).toBe(false);
  });
});

describe('AC-03 — a filter that empties the result set does not strand the admin', () => {
  it('clamps a page that no longer exists', () => {
    const deep = pagesForward(3); // page 4
    // A filter now matches two rows: page 4 of 1 would render nothing at all.
    expect(clampPage(deep, 2).page).toBe(1);
    expect(totalPages(2, DEFAULT_PAGE_SIZE)).toBe(1);
  });

  it('leaves a page that still exists alone', () => {
    const deep = pagesForward(3);
    expect(clampPage(deep, TOTAL)).toBe(deep);
  });

  it('reports a single page for a result set smaller than one page', () => {
    expect(totalPages(2, DEFAULT_PAGE_SIZE)).toBe(1);
    expect(totalPages(0, DEFAULT_PAGE_SIZE)).toBe(1);
  });
});

describe('FR-03 — mobile "Load more" still appends', () => {
  it('keeps what is already on screen and adds the next page', () => {
    const first = INITIAL_PAGING;
    const rows = mergeRows([], serverRows(first), first.intent);
    expect(rows).toHaveLength(20);

    const more = loadMore(first);
    const after = mergeRows(rows, serverRows(more), more.intent);
    expect(after).toHaveLength(40);
    expect(after[0]).toBe(1);
    expect(after.at(-1)).toBe(40);
  });

  it('appends past the clamp, where the old model stalled', () => {
    let state: PagingState = { ...INITIAL_PAGING };
    let rows = mergeRows<number>([], serverRows(state), state.intent);
    for (let i = 0; i < 5; i += 1) {
      state = loadMore(state);
      rows = mergeRows(rows, serverRows(state), state.intent);
    }
    // Six pages of 20. The accumulating prefix asked for 120 and got 100 here.
    expect(rows).toHaveLength(120);
    expect(rows.at(-1)).toBe(120);
    expect(new Set(rows).size).toBe(120);
  });

  it('replaces rather than appends for every other interaction', () => {
    const desktop = goToPage(INITIAL_PAGING, 3, TOTAL);
    expect(desktop.intent).toBe('replace');
    expect(mergeRows([1, 2, 3], [41, 42], desktop.intent)).toEqual([41, 42]);

    const resized = changePageSize(50);
    expect(resized.intent).toBe('replace');
    expect(mergeRows([1, 2, 3], [1, 2], resized.intent)).toEqual([1, 2]);
  });

  it('starts again at page 1 when the page size changes', () => {
    expect(changePageSize(50)).toEqual({ page: 1, pageSize: 50, intent: 'replace' });
  });
});

describe('FR-02 — the label names the rows actually rendered', () => {
  it('names this page’s window on desktop', () => {
    const page3 = pagesForward(2);
    // The old label read "Page 3 of 10" above rows 1-60. This one cannot.
    expect(showingLabel(page3, 20, TOTAL)).toBe('Showing 41–60 of 250');
  });

  it('names the whole accumulated run after Load more', () => {
    const appended = loadMore(loadMore(INITIAL_PAGING));
    expect(showingLabel(appended, 60, TOTAL)).toBe('Showing 1–60 of 250');
  });

  it('does not print a range for a single row', () => {
    const page3 = pagesForward(2);
    expect(showingLabel(page3, 1, TOTAL)).toBe('Showing 41 of 250');
  });

  it('does not print "1–0" for an empty page', () => {
    expect(rowWindow(INITIAL_PAGING, 0)).toBeNull();
    expect(showingLabel(INITIAL_PAGING, 0, 0)).toBe('Showing 0 of 0');
  });

  it('groups thousands the way the rest of the admin portal does', () => {
    expect(showingLabel(INITIAL_PAGING, 20, 12345)).toBe('Showing 1–20 of 12,345');
  });
});

describe('FR-04 — Next and Load more are truthful', () => {
  it('offers more while rows remain past the last one on screen', () => {
    expect(hasMore(INITIAL_PAGING, 20, TOTAL)).toBe(true);
    expect(hasMore(pagesForward(5), 20, TOTAL)).toBe(true);
  });

  it('offers nothing once the last row is on screen', () => {
    const last = pagesForward(12);
    expect(rowWindow(last, 10)).toEqual({ from: 241, to: 250 });
    expect(hasMore(last, 10, TOTAL)).toBe(false);
  });

  it('is keyed on the last row on screen, not on how many are loaded', () => {
    // 20 rows loaded, but they are rows 241-250 of 250 — there is nothing more.
    // A count-based check (`loaded < total`) would say there is.
    const last = pagesForward(12);
    expect(hasMore(last, 10, TOTAL)).toBe(false);
    expect(10 < TOTAL).toBe(true);
  });
});
