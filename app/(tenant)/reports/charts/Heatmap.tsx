'use client';

/**
 * A weekday × hour grid.
 *
 * Values arrive already normalised to the grid's own busiest cell, so this
 * component only paints intensity — it makes no claim about what the intensity
 * measures. The card above it says that, because "busy" and "full" are
 * different statements and only one of them needs a capacity denominator.
 */
export function Heatmap({
  days,
  hours,
  grid,
  /** What a cell's tooltip should say, given its normalised value. */
  describe,
  /** The two ends of the key. Words, not "low"/"high" — see conventions §12. */
  quietWord,
  busyWord,
}: {
  days: string[];
  hours: string[];
  grid: number[][];
  describe?: (day: string, hour: string, value: number) => string;
  quietWord: string;
  busyWord: string;
}) {
  /**
   * Five bands, cool to warm, rather than one hue at five opacities.
   *
   * A single green at 0.12 to 0.84 alpha is a ramp only a chart-reader can
   * see: the middle three quarters of it are the same colour slightly darker,
   * so "half full" and "nearly full" look alike, which is the one comparison
   * this grid exists to make. Hue moves as well as lightness now, so the
   * bands separate at a glance.
   *
   * It stops at amber rather than running to red. Red means called-off
   * everywhere else in Reports, and the busiest hour of the week is the
   * opposite of a problem (conventions §3 — one meaning per colour, same as
   * one meaning per word).
   *
   * Discrete bands, not a continuous gradient, because a legend can name five
   * bands and cannot name a gradient.
   */
  const BANDS = [
    { upTo: 0.2, fill: '#dbeafe', ink: '#1e3a8a' },
    { upTo: 0.4, fill: '#a7d8d0', ink: '#0f766e' },
    { upTo: 0.6, fill: '#6ec49b', ink: '#14532d' },
    { upTo: 0.8, fill: '#3f9d63', ink: '#ffffff' },
    { upTo: 1.01, fill: '#f0a02a', ink: '#4a2d02' },
  ];

  const band = (value: number) => BANDS.find((b) => value <= b.upTo) ?? BANDS[BANDS.length - 1]!;
  const shade = (value: number) => (value === 0 ? 'var(--rp-heat-empty)' : band(value).fill);

  return (
    // Scrolls inside its own box. A grid this wide must never widen the page —
    // that is the horizontal-scrollbar defect the shell rules exist to prevent.
    <div className="rp-heat-scroll">
      <div className="rp-heat" style={{ ['--rp-heat-cols' as string]: hours.length }}>
        <div className="rp-heat-row rp-heat-head">
          <span />
          {hours.map((hour, i) => (
            <span key={i} className="rp-heat-hour">
              {hour}
            </span>
          ))}
        </div>
        {days.map((day, r) => (
          <div className="rp-heat-row" key={day}>
            <span className="rp-heat-day">{day}</span>
            {grid[r]!.map((value, c) => (
              <span
                key={c}
                className="rp-heat-cell"
                style={{ background: shade(value) }}
                title={describe ? describe(day, hours[c]!, value) : `${day} ${hours[c]}`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Without this the colours are decoration: five shades and nothing
          saying which end is which. */}
      <div className="rp-heat-key" aria-hidden="true">
        <span className="rp-heat-key-word">{quietWord}</span>
        <span className="rp-heat-key-cell" style={{ background: 'var(--rp-heat-empty)' }} />
        {BANDS.map((b) => (
          <span key={b.fill} className="rp-heat-key-cell" style={{ background: b.fill }} />
        ))}
        <span className="rp-heat-key-word">{busyWord}</span>
      </div>
    </div>
  );
}
