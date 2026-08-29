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
  cards,
  pageSize = PAGE_SIZE,
  children,
}: {
  head: ReactNode;
  /** Plural, for the "Showing 1–10 of 20 services" line. */
  noun: string;
  /**
   * The same rows as cards, for phones — a multi-column table is unreadable
   * there, and the columns that fall off the right are the ones with the
   * actions on them. Built from the same array in the same order as `children`,
   * so the two are sliced by one page index and can never disagree. Omit it and
   * the table stays on at every width, as before.
   */
  cards?: ReactNode;
  pageSize?: number;
  children: ReactNode;
}) {
  const rows = Children.toArray(children);
  const cardList = cards === undefined ? null : Children.toArray(cards);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(page, pageCount);
  const from = (clamped - 1) * pageSize;
  const visible = rows.slice(from, from + pageSize);

  return (
    <>
      <div className={`table-scroll ${cardList ? 'paged-table' : ''}`}>
        <table>
          <thead>{head}</thead>
          <tbody>{visible}</tbody>
        </table>
      </div>
      {cardList && <div className="paged-cards">{cardList.slice(from, from + pageSize)}</div>}
      <Pagination page={clamped} total={rows.length} pageSize={pageSize} noun={noun} onChange={setPage} />
    </>
  );
}
