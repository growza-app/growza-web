'use client';

import { Children, useState, type ReactNode } from 'react';
import { useFitRows } from '../lib/use-fit-rows';

/**
 * Wraps a table so it pages instead of scrolling: `useFitRows` measures how
 * many rows the viewport actually fits, and only those render.
 *
 * Rows are passed as CHILDREN rather than through a render prop, so a server
 * component can use this directly — a function prop cannot cross the
 * server/client boundary, but already-built <tr> elements can. Each row must
 * carry `data-row` so the measurement can find it.
 */
export function PaginatedTable({
  head,
  noun,
  fallback = 6,
  children,
}: {
  head: ReactNode;
  /** Plural, for the "Showing 1 to 5 of 20 services" line. */
  noun: string;
  fallback?: number;
  children: ReactNode;
}) {
  const rows = Children.toArray(children);
  const [page, setPage] = useState(1);
  const { pageSize, listRef } = useFitRows({ fallback });

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(page, pageCount);
  const visible = rows.slice((clamped - 1) * pageSize, clamped * pageSize);

  return (
    <>
      <div className="table-scroll" ref={listRef}>
        <table>
          <thead>{head}</thead>
          <tbody>{visible}</tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <div className="pagination">
          <span className="muted">
            Showing {(clamped - 1) * pageSize + 1} to {Math.min(clamped * pageSize, rows.length)} of {rows.length}{' '}
            {noun}
          </span>
          <div className="pagination-controls">
            <button type="button" className="pagination-btn" disabled={clamped <= 1} onClick={() => setPage(clamped - 1)}>
              ‹
            </button>
            <button type="button" className="pagination-btn pagination-btn-active">
              {clamped}
            </button>
            <button
              type="button"
              className="pagination-btn"
              disabled={clamped >= pageCount}
              onClick={() => setPage(clamped + 1)}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </>
  );
}
