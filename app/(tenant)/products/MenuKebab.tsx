'use client';

import { Fragment, useCallback, useState } from 'react';
import { useAnchoredPanel } from '../lib/useAnchoredPanel';

export interface KebabItem {
  label: string;
  onSelect: () => void;
  /** Last, red, and set apart: the final thing (Delete). */
  danger?: boolean;
}

/**
 * Owner, 2026-11-20 ("quiet table") — the Menu's ⋮: the row's rarer actions, and the toolbar's set-up jobs, as words
 * in a list instead of a row of unlabelled icons. The same panel as Services and Offers (`.dropdown-panel`, placed by
 * `useAnchoredPanel` so the last row's menu is not clipped by the card).
 */
export function MenuKebab({ label, items, className }: { label: string; items: readonly KebabItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const panel = useAnchoredPanel(open, close);
  if (items.length === 0) return null;
  return (
    <div className={`dropdown-anchor mnu-kebab ${className ?? ''}`} ref={open ? panel.anchorRef : undefined} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="kebab-btn mnu-kebab-btn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        ⋮
      </button>
      {open ? (
        <div className="dropdown-panel dropdown-panel-sm dropdown-panel-right" role="menu" ref={panel.panelRef} style={panel.style}>
          {items.map((it, i) => (
            <Fragment key={it.label}>
              {it.danger && i > 0 ? <span className="dropdown-sep" /> : null}
              <button
                type="button"
                role="menuitem"
                className={`dropdown-item dropdown-item-plain ${it.danger ? 'dropdown-item-danger' : ''}`}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
