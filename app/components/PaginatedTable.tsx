'use client';

import { Children, useState, type ReactNode } from 'react';
import { Pagination, PAGE_SIZE } from './Pagination';

/**
 * Wraps a table so it pages in fixed-size chunks with the shared
 * {@link Pagination} footer. The list scrolls within the page body; a numbered
 * footer sits below it. Standard "scroll + paginate" for the larger list
 * screens (Bookings, Services, Staff).
 *
 * Rows are passed as CHILDREN rather than through a render prop, so a server
 * component can use this directly — a function prop cannot cross the
 * server/client boundary, but already-built <tr> elements can.
 */
export function PaginatedTable({
  head,
  noun,
  pageSize = PAGE_SIZE,
  children,
}: {
  head: ReactNode;
  /** Plural, for the "Showing 1–10 of 20 services" line. */
  noun: string;
  pageSize?: number;
  children: ReactNode;
}) {
  const rows = Children.toArray(children);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(page, pageCount);
  const visible = rows.slice((clamped - 1) * pageSize, clamped * pageSize);

  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>{head}</thead>
          <tbody>{visible}</tbody>
        </table>
      </div>
      <Pagination page={clamped} total={rows.length} pageSize={pageSize} noun={noun} onChange={setPage} />
    </>
  );
}
