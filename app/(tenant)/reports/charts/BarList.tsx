'use client';

import { useState } from 'react';

export interface BarItem {
  label: string;
  value: number;
  /** Rendered figure. The bar shows proportion; this shows the real number. */
  display: string;
  color?: string;
  /** Retired services and inactive staff still appear, marked (conventions §2). */
  note?: string;
}

/**
 * Ranked horizontal bars.
 *
 * Bars are proportional to the largest item, not to a total — these lists are
 * "top 5 of many", so a percentage-of-total reading would be wrong.
 */
export function BarList({ items, emptyText }: { items: BarItem[]; emptyText: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (items.length === 0) return <p className="rp-empty">{emptyText}</p>;

  const max = Math.max(...items.map((i) => i.value));

  return (
    <div className="rp-bars">
      {items.map((item, i) => {
        const color = item.color ?? 'var(--rp-brand)';
        return (
          <div
            key={`${item.label}-${i}`}
            className="rp-bar-row"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="rp-bar-head">
              <span className="rp-bar-label">
                {item.label}
                {item.note && <em className="rp-bar-note">{item.note}</em>}
              </span>
              <span className="rp-bar-value" style={hover === i ? { color } : undefined}>
                {item.display}
              </span>
            </div>
            <div className="rp-bar-track">
              <div
                className="rp-bar-fill"
                style={{
                  // A zero-width bar for a real row reads as missing data, so
                  // every present row keeps a visible sliver.
                  width: `${max > 0 ? Math.max(2, (item.value / max) * 100) : 0}%`,
                  background: color,
                  opacity: hover === i ? 1 : 0.9,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
