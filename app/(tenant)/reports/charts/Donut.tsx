'use client';

import { useState } from 'react';

export interface DonutSegment {
  label: string;
  value: number;
  display: string;
  color: string;
}

/**
 * A slice's share, which is never allowed to read as nothing when it is not.
 *
 * A ₹11,580 slice rounded to "0%", which is a row saying it has money and no
 * share in the same breath. Anything real but under half a per cent says
 * "<1%" instead — the same reason a delta says "no prior period" rather than
 * 0% (epic BR-07).
 */
function share(value: number, total: number): string {
  if (value === 0) return '0%';
  const pct = (value / total) * 100;
  return pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

/**
 * A share-of-total ring with a legend.
 *
 * Hovering a segment moves its figure into the centre, so the ring can be read
 * without a tooltip that would be unusable on a phone.
 */
export function Donut({
  segments,
  centreLabel,
  centreValue,
  emptyText,
}: {
  segments: DonutSegment[];
  centreLabel: string;
  centreValue: string;
  emptyText: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  // A ring of zero-length arcs is not an empty state, it is a rendering
  // artefact that reads as a broken chart.
  if (total === 0) return <p className="rp-empty">{emptyText}</p>;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const centre = 68;
  let offset = 0;
  const active = hover === null ? null : segments[hover];

  return (
    <div className="rp-donut">
      <svg viewBox="0 0 136 136" width={136} height={136} role="img">
        {segments.map((segment, i) => {
          const dash = (segment.value / total) * circumference;
          const node = (
            <circle
              key={i}
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={hover === i ? 20 : 16}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${centre} ${centre})`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
          offset += dash;
          return node;
        })}
        <text x={centre} y={centre - 3} textAnchor="middle" className="rp-donut-value">
          {active ? active.display : centreValue}
        </text>
        <text x={centre} y={centre + 15} textAnchor="middle" className="rp-donut-label">
          {active ? active.label : centreLabel}
        </text>
      </svg>

      <div className="rp-donut-legend">
        {segments.map((segment, i) => (
          <div
            key={i}
            className="rp-legend-row"
            style={{ opacity: hover === null || hover === i ? 1 : 0.5 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="rp-legend-dot" style={{ background: segment.color }} />
            <span className="rp-legend-label">{segment.label}</span>
            <span className="rp-legend-value">{segment.display}</span>
            <span className="rp-legend-pct">{share(segment.value, total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
