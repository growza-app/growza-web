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
 *
 * Fit-to-viewport is CSS the caller opts into (a `*-fit` class on the
 * ancestor `.page-body`, see globals.css) — this component can't reach
 * outside itself to flex its own ancestors, but its own markup (`.table-scroll`
 * / `.paged-cards` / the pagination footer) is exactly what that CSS targets,
 * so a new consumer gets the scroll-and-pin behaviour for free from the
 * shared rules once it's wrapped in a fit ancestor.
 */
export function PaginatedTable({
  head,
  noun,
  cards,
  pageSize = PAGE_SIZE,
  children,
  page: controlledPage,
  total: controlledTotal,
  onPageChange,
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
  /**
   * Controlled mode, for a list that's already paginated server-side
   * (Customers): `children`/`cards` are just this one page's rows, rendered
   * as-is with no further client-side slicing. Pass all three of `page`,
   * `total` and `onPageChange` together; omitting them keeps the default
   * uncontrolled mode, which slices its own `children` into pages.
   */
  page?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}) {
  const controlled = controlledPage !== undefined;
  const [internalPage, setInternalPage] = useState(1);

  const rows = Children.toArray(children);
  const cardList = cards === undefined ? null : Children.toArray(cards);

  if (controlled) {
    return (
      <>
        <div className={`table-scroll ${cardList ? 'paged-table' : ''}`}>
          <table>
            <thead>{head}</thead>
            <tbody>{rows}</tbody>
          </table>
        </div>
        {cardList && <div className="paged-cards">{cardList}</div>}
        <Pagination page={controlledPage} total={controlledTotal ?? rows.length} pageSize={pageSize} noun={noun} onChange={onPageChange!} />
      </>
    );
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(internalPage, pageCount);
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
      <Pagination page={clamped} total={rows.length} pageSize={pageSize} noun={noun} onChange={setInternalPage} />
    </>
  );
}
