'use client';

import { oklch } from '../tokens';
import { Icon } from '../icons';
import { Select } from './primitives';
import {
  PAGE_SIZE_OPTIONS,
  changePageSize,
  goToPage,
  hasMore,
  loadMore,
  showingLabel,
  totalPages,
  type PagingState,
} from '../lib/paging';

/**
 * GRW-96's pagination primitive — the one control every admin list screen with
 * a potentially large dataset uses (businesses, subscriptions, payments,
 * invoices, usage records, audit logs).
 *
 * Jira GRW-140 · GRW-212 rewrote how it pages. The arithmetic and the two
 * interaction models live in `../lib/paging`, which is where they can be
 * tested; this file is the control that dispatches them. Read that file's
 * header for why the request stopped being an accumulating prefix.
 *
 * Two things went with that change:
 *
 * - `usePagedSlice`, the client-side `items.slice(0, page * pageSize)` from
 *   when every list was mock data. It had no call sites left and it modelled
 *   the accumulate-always semantics this ticket removed.
 * - `maxRows`, QA pass 7's containment. It disabled "Next" at the server's
 *   hundred-row cap and told the reader to "narrow with filters to reach the
 *   rest" — an honest description of a list that could not be paged. With real
 *   offset paging there is no rest to reach, so the prop and its copy are gone.
 */
export { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../lib/paging';
export type { PagingState as PaginationState } from '../lib/paging';

export function Pagination({
  total,
  loaded,
  state,
  onChange,
}: {
  /** Total rows after filtering, before pagination. */
  total: number;
  /** Rows actually on screen — one page after a numbered step, the accumulated run after "Load more". */
  loaded: number;
  state: PagingState;
  onChange: (next: PagingState) => void;
}) {
  if (total === 0) return null;

  const pages = totalPages(total, state.pageSize);
  const atStart = state.page <= 1;
  const atEnd = state.page >= pages;
  const more = hasMore(state, loaded, total);

  return (
    <div style={{ marginTop: 14 }}>
      <div className="admin-pagination-desktop" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>{showingLabel(state, loaded, total)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>
            Rows
            <div style={{ width: 76 }}>
              <Select
                aria-label="Rows per page"
                options={PAGE_SIZE_OPTIONS.map(String)}
                value={String(state.pageSize)}
                onChange={(e) => onChange(changePageSize(Number(e.target.value)))}
                style={{ height: 34, fontSize: 12.5 }}
              />
            </div>
          </div>
          <PageButton onClick={() => onChange(goToPage(state, state.page - 1, total))} disabled={atStart} label="Previous page">
            <Icon name="chevronLeft" size={14} />
          </PageButton>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.3 0.02 155)', minWidth: 64, textAlign: 'center' }}>
            Page {state.page} of {pages}
          </span>
          <PageButton onClick={() => onChange(goToPage(state, state.page + 1, total))} disabled={atEnd} label="Next page">
            <Icon name="chevronRight" size={14} />
          </PageButton>
        </div>
      </div>

      <div className="admin-pagination-mobile" style={{ justifyContent: 'center' }}>
        {more ? (
          <button
            type="button"
            onClick={() => onChange(loadMore(state))}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 11,
              border: `1px solid ${oklch.borderStrong}`,
              background: 'white',
              color: oklch.accentText,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Load more
          </button>
        ) : (
          <div style={{ width: '100%', textAlign: 'center', fontSize: 12.5, color: oklch.textFaint, fontWeight: 600, padding: '10px 0' }}>
            {`All ${total.toLocaleString('en-IN')} shown`}
          </div>
        )}
      </div>
    </div>
  );
}

function PageButton({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        border: `1px solid ${oklch.borderStrong}`,
        background: 'white',
        color: disabled ? 'oklch(0.8 0.008 150)' : 'oklch(0.4 0.02 155)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
