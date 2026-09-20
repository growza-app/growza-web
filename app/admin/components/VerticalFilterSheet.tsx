'use client';

import { useEffect, useState, useRef } from 'react';
import { Icon, TypeIcon } from '../icons';
import { oklch } from '../tokens';
import { TextInput } from './primitives';
import { useDialog } from '../../shared/a11y/useDialog';

const ALL = 'All';

/**
 * Jira GRW-297 — the vertical filter's admin-mobile picker, split out of
 * businesses/page.tsx to keep that file under the repo's 400-line lint limit
 * (the same reason GRW-280 split dashboard-config.ts out of admin/page.tsx).
 *
 * A native `<select>`'s own dropdown can't be themed, so on a phone it's
 * replaced with a bottom sheet built from this screen's own parts: white
 * sheet, close icon, search, list — matching AuditLogList's mobile filter
 * sheet (same overlay/backdrop/z-index) rather than inventing a second
 * pattern. Desktop keeps the plain `<select>`, rendered by the caller.
 */
export function VerticalFilterSheet({
  open,
  options,
  value,
  onSelect,
  onClose,
}: {
  open: boolean;
  /** `[ALL, ...verticalNames]` — the caller's own list, so a vertical shipped as JSON still appears here with no change to this file. */
  options: string[];
  value: string;
  onSelect: (vertical: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  // Cleared every time the sheet OPENS — same reason ConfirmDialog clears its
  // reason field on open: this component doesn't unmount when closed, so a
  // stale search from the last time it was opened would otherwise survive.
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose, active: open });

  if (!open) return null;

  const filtered = options.filter((v) => v.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', background: 'oklch(0.2 0.02 155 / 0.5)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        ref={dialogRef}
        aria-modal="true"
        aria-label="Filter by vertical"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '85vh',
          background: 'white',
          borderRadius: '18px 18px 0 0',
          display: 'flex',
          flexDirection: 'column',
          animation: 'admin-sheet-up 0.22s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: `1px solid ${oklch.divider}` }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Filter by vertical</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              border: `1px solid ${oklch.border}`,
              background: 'white',
              color: oklch.textMuted,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div style={{ padding: '14px 20px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'oklch(0.6 0.02 155)', display: 'flex' }}>
              <Icon name="search" size={16} />
            </span>
            <TextInput
              autoFocus
              aria-label="Search verticals"
              placeholder="Search verticals…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 12px 20px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: 13.5, color: oklch.textFaint }}>No verticals match “{search}”.</div>
          ) : (
            filtered.map((f) => {
              const selected = value === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => onSelect(f)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 8px',
                    borderRadius: 12,
                    border: 'none',
                    background: selected ? 'oklch(0.95 0.035 150)' : 'transparent',
                    color: selected ? 'oklch(0.31 0.055 158)' : oklch.textStrong,
                    fontSize: 14.5,
                    fontWeight: selected ? 800 : 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {f !== ALL ? <TypeIcon type={f} size={18} /> : <span style={{ width: 18, flex: 'none' }} />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
                  {selected ? <Icon name="check" size={16} /> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
