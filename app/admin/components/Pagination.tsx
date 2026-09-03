'use client';

import { useMemo } from 'react';
import { oklch } from '../tokens';
import { Icon } from '../icons';
import { Select } from './primitives';

/**
 * GRW-96's pagination primitive — the one control every list screen with a
 * potentially large dataset uses (businesses, subscriptions, payments,
 * invoices, usage records, audit logs). 20 by default, 50 and 100
 * selectable, desktop page controls collapsing to a mobile "Load more"
 * below the standing 860px breakpoint. Purely client-side slicing here,
 * since every list is still mock data — the shape is what a real
 * server-paginated endpoint will slot into.
 */
export interface PaginationState {
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [20, 50, 100];

export function usePagedSlice<T>(items: T[], state: PaginationState): T[] {
  return useMemo(() => items.slice(0, state.page * state.pageSize), [items, state.page, state.pageSize]);
}

export function Pagination({
  total,
  shown,
  state,
  onChange,
  maxRows,
}: {
  /** Total rows after filtering, before pagination. */
  total: number;
  /** Rows actually rendered so far (state.page * state.pageSize, clamped). */
  shown: number;
  state: PaginationState;
  onChange: (next: PaginationState) => void;
  /**
   * QA pass 7 (HIGH) — set only by a caller whose backend enforces a hard
   * per-request row cap (GRW-100/GRW-111's admin-read layer clamps
   * `pageSize` to 100 server-side, silently: `src/modules/admin/{businesses,
   * subscriptions}.ts`'s own `Math.min(Math.max(...), 100)`). Without this,
   * `totalPages`/`hasMore` below are computed purely from `total` and the
   * REQUESTED `state.pageSize` — both of which keep climbing past what the
   * backend will ever actually return, so "Page 6 of 8" kept rendering (and
   * "Next"/"Load more" kept accepting clicks) past the point where every
   * further click re-fetched the exact same capped 100 rows. Every other
   * consumer of this component still paginates purely client-side (this
   * file's own top comment) and leaves this unset, unaffected.
   */
  maxRows?: number;
}) {
  if (total === 0) return null;

  const effectiveTotal = maxRows !== undefined ? Math.min(total, maxRows) : total;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / state.pageSize));
  const atStart = state.page <= 1;
  const atEnd = state.page >= totalPages;
  const hasMore = shown < effectiveTotal;
  const capped = maxRows !== undefined && total > maxRows;

  const goTo = (page: number) => onChange({ ...state, page: Math.min(Math.max(1, page), totalPages) });
  const changeSize = (pageSize: number) => onChange({ page: 1, pageSize });

  return (
    <div style={{ marginTop: 14 }}>
      <div className="admin-pagination-desktop" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>
          Showing {Math.min(shown, effectiveTotal)} of {total.toLocaleString('en-IN')}
          {capped ? ` — narrow with filters to reach the rest past ${maxRows!.toLocaleString('en-IN')}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>
            Rows
            <div style={{ width: 76 }}>
              <Select
                options={PAGE_SIZE_OPTIONS.map(String)}
                value={String(state.pageSize)}
                onChange={(e) => changeSize(Number(e.target.value))}
                style={{ height: 34, fontSize: 12.5 }}
              />
            </div>
          </div>
          <PageButton onClick={() => goTo(state.page - 1)} disabled={atStart} label="Previous page">
            <Icon name="chevronLeft" size={14} />
          </PageButton>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.3 0.02 155)', minWidth: 64, textAlign: 'center' }}>
            Page {state.page} of {totalPages}
          </span>
          <PageButton onClick={() => goTo(state.page + 1)} disabled={atEnd} label="Next page">
            <Icon name="chevronRight" size={14} />
          </PageButton>
        </div>
      </div>

      <div className="admin-pagination-mobile" style={{ justifyContent: 'center' }}>
        {hasMore ? (
          <button
            type="button"
            onClick={() => onChange({ ...state, page: state.page + 1 })}
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
            {capped
              ? `Showing the first ${maxRows!.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} — narrow with filters to see the rest`
              : `All ${total.toLocaleString('en-IN')} shown`}
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
