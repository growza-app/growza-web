'use client';

import { useId, useState } from 'react';

export interface LineSeries {
  name?: string;
  color: string;
  values: number[];
  /** How a value reads in the hover tooltip, e.g. money or "12 bookings". */
  format?: (value: number) => string;
  /**
   * A reference line rather than the data: drawn dashed and thin, with no
   * fill and no hover dot, so it reads as an overlay on the series rather
   * than as a second thing that happened.
   */
  dashed?: boolean;
}

/**
 * A trend line, drawn as plain SVG.
 *
 * Deliberately no charting dependency: the design's own prototype draws these
 * by hand in about thirty lines, and a library would add a bundle, a theming
 * layer and an upgrade path for something this page uses five times.
 */
export function LineChart({
  labels,
  series,
  height = 210,
  showAxis = true,
  fill = false,
  zeroBased = false,
  label,
}: {
  /** What this chart shows. Falls back to its series names, then to the dates it spans. */
  label?: string;
  labels: string[];
  series: LineSeries[];
  height?: number;
  showAxis?: boolean;
  fill?: boolean;
  zeroBased?: boolean;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const width = 680;
  const padTop = 14;
  const padBottom = showAxis ? 26 : 10;
  const padX = 6;
  const points = labels.length;
  // Jira GRW-342 — a chart is an image to a screen reader, so it needs a name: what it shows, then the span it covers.
  const named = label ?? series.map((s) => s.name).filter(Boolean).join(', ');
  const dates = points > 1 ? `${labels[0]} – ${labels[points - 1]}` : (labels[0] ?? '');
  const chartName = [named, dates].filter(Boolean).join(', ');

  const all = series.flatMap((s) => s.values);
  if (points === 0 || all.length === 0) return null;

  let min = zeroBased ? 0 : Math.min(...all);
  let max = Math.max(...all);
  // A flat series has no spread to scale against, so give it a nominal one —
  // otherwise every point lands on the same pixel row and the line vanishes.
  const pad = (max - min) * 0.12 || 1;
  max += pad;
  min = Math.max(0, min - pad * 0.5);
  const span = max - min || 1;

  // A one-bucket range (Today) has no second point to draw a line to. Pin it
  // to the middle and render a marker instead of a degenerate path.
  const x = (i: number) => (points === 1 ? width / 2 : padX + (i * (width - padX * 2)) / (points - 1));
  const y = (v: number) => padTop + (1 - (v - min) / span) * (height - padTop - padBottom);

  const linePath = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');

  return (
    <div
      className="rp-chart"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - box.left) / box.width;
        setHover(Math.max(0, Math.min(points - 1, Math.round(ratio * (points - 1)))));
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={chartName}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {[0, 1, 2, 3].map((g) => {
          const gy = padTop + (g * (height - padTop - padBottom)) / 3;
          return <line key={g} x1={padX} x2={width - padX} y1={gy} y2={gy} className="rp-gridline" />;
        })}

        {series.map((s, i) => (
          <g key={i}>
            {fill && !s.dashed && points > 1 && (
              <path
                d={`${linePath(s.values)} L${x(points - 1)},${height - padBottom} L${x(0)},${height - padBottom} Z`}
                fill={`url(#${gradientId}-${i})`}
              />
            )}
            {points > 1 ? (
              <path
                d={linePath(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.dashed ? 1.8 : 2.4}
                strokeDasharray={s.dashed ? '6 5' : undefined}
                strokeOpacity={s.dashed ? 0.75 : 1}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <circle cx={x(0)} cy={y(s.values[0]!)} r={5} fill={s.color} />
            )}
          </g>
        ))}

        {hover !== null && points > 1 && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padTop} y2={height - padBottom} className="rp-crosshair" />
            {series.map((s, i) =>
              s.dashed ? null : (
                <circle key={i} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill="#fff" stroke={s.color} strokeWidth={2.5} />
              ),
            )}
          </g>
        )}

        {showAxis &&
          labels.map((label, i) => {
            // Thin the labels rather than let them overlap into mush.
            const stride = Math.ceil(points / 8);
            if (points > 8 && i % stride !== 0) return null;
            return (
              <text key={i} x={x(i)} y={height - 8} className="rp-axis-label" textAnchor="middle">
                {label}
              </text>
            );
          })}
      </svg>

      {hover !== null && (
        <div className="rp-chart-tip">
          <span className="rp-chart-tip-label">{labels[hover]}</span>
          {series.filter((s) => !s.dashed).map((s, i) => (
            <span key={i} className="rp-chart-tip-value" style={{ color: s.color }}>
              {s.name ? `${s.name}: ` : ''}
              {s.format ? s.format(s.values[hover]!) : s.values[hover]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
