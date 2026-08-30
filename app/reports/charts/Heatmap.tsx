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
}: {
  days: string[];
  hours: string[];
  grid: number[][];
  describe?: (day: string, hour: string, value: number) => string;
}) {
  const shade = (value: number) => (value === 0 ? 'var(--rp-heat-empty)' : `rgba(22, 163, 74, ${0.12 + value * 0.72})`);

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
    </div>
  );
}
