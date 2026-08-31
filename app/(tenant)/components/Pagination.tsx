'use client';

/**
 * The one pagination control every list uses. Two product rules are baked in:
 *
 *  1. It renders NOTHING when there's a single page — small datasets never
 *     show a pointless footer.
 *  2. It lives in normal flow at the bottom of its list container — never
 *     pinned to the viewport or floating over the bottom nav.
 *
 * Two modes, one look:
 *
 *  - **numbered** (default): a known total split into fixed-size pages, so we
 *    can show a windowed number strip and "Page X of N". Used by server-paged
 *    lists (Customers, Bookings) where the page size is fixed.
 *
 *  - **cursor**: a fit-to-screen list where each page holds however many rows
 *    physically fit, so the page COUNT isn't known ahead of time. We show the
 *    honest item range ("Showing 3–6 of 12") with ‹ › controls. Used by Offers,
 *    where a page of tall combos holds fewer cards than a page of short offers.
 *
 * Desktop shows the number strip (numbered mode) or the range (both); mobile
 * collapses to compact controls — CSS-driven, see .pagination-* in globals.css.
 */

/** Rows per page for standard scroll-and-paginate lists (Bookings, Customers, Services). */
export const PAGE_SIZE = 10;

/** Max numbered buttons shown at once on desktop; the window slides around the current page. */
const NUMBER_WINDOW = 5;

function pageWindow(current: number, pageCount: number): number[] {
  if (pageCount <= NUMBER_WINDOW) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  let start = Math.max(1, current - Math.floor(NUMBER_WINDOW / 2));
  const end = Math.min(pageCount, start + NUMBER_WINDOW - 1);
  start = Math.max(1, end - NUMBER_WINDOW + 1); // re-anchor when we hit the top edge
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

type NumberedProps = {
  mode?: 'numbered';
  /** 1-based current page. */
  page: number;
  /** Total items across all pages. */
  total: number;
  /** Items per page. */
  pageSize: number;
  noun: string;
  onChange: (page: number) => void;
};

type CursorProps = {
  mode: 'cursor';
  /** 1-based index of the first item shown (0 when the list is empty). */
  from: number;
  /** 1-based index of the last item shown. */
  to: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  noun: string;
};

export function Pagination(props: NumberedProps | CursorProps) {
  if (props.mode === 'cursor') {
    const { from, to, total, hasPrev, hasNext, onPrev, onNext, noun } = props;
    // A single screenful holds everything — no navigation needed, no footer.
    if (!hasPrev && !hasNext) return null;
    return (
      <nav className="pagination" aria-label="Pagination">
        <span className="pagination-summary">
          Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> {noun}
        </span>
        <div className="pagination-controls">
          <button type="button" className="pagination-btn" disabled={!hasPrev} onClick={onPrev} aria-label="Previous page">
            ‹
          </button>
          <button type="button" className="pagination-btn" disabled={!hasNext} onClick={onNext} aria-label="Next page">
            ›
          </button>
        </div>
      </nav>
    );
  }

  const { page, total, pageSize, noun, onChange } = props;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const current = Math.min(Math.max(1, page), pageCount);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const numbers = pageWindow(current, pageCount);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-summary">
        Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> {noun}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          disabled={current <= 1}
          onClick={() => onChange(current - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>

        <div className="pagination-pages">
          {numbers.map((n) => (
            <button
              key={n}
              type="button"
              className={`pagination-btn ${n === current ? 'pagination-btn-active' : ''}`}
              aria-current={n === current ? 'page' : undefined}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <span className="pagination-indicator">
          Page {current} of {pageCount}
        </span>

        <button
          type="button"
          className="pagination-btn"
          disabled={current >= pageCount}
          onClick={() => onChange(current + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </nav>
  );
}
