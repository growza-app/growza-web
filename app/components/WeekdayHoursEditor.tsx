'use client';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface WeekdayRow {
  weekday: number;
  open: boolean;
  startTime: string;
  endTime: string;
}

/**
 * Shared between the org-level Settings > Working hours form and each
 * staff member's own working-hours editor — both edit the exact same
 * "one range per weekday" shape.
 */
export function toWeekdayRows(rows: Array<{ weekday: number; startTime: string; endTime: string }>): WeekdayRow[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    // A weekday can have more than one row (split shift) — this editor only
    // supports one range per day, so it collapses to the outer start/end.
    // Saving from here replaces a split shift with a single block; that's
    // an accepted simplification, not silent data loss, since the row is
    // still shown (just merged) rather than dropped.
    const matches = rows.filter((r) => r.weekday === weekday);
    if (matches.length === 0) return { weekday, open: false, startTime: '09:00', endTime: '18:00' };
    const start = matches.reduce((a, b) => (a.startTime < b.startTime ? a : b)).startTime.slice(0, 5);
    const end = matches.reduce((a, b) => (a.endTime > b.endTime ? a : b)).endTime.slice(0, 5);
    return { weekday, open: true, startTime: start, endTime: end };
  });
}

export function WeekdayHoursEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: WeekdayRow[];
  onChange: (weekday: number, patch: Partial<WeekdayRow>) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {rows.map((r) => (
        <div className={`weekday-hours-row ${disabled ? 'weekday-hours-row-disabled' : ''}`} key={r.weekday}>
          <label className="switch">
            <input type="checkbox" checked={r.open} disabled={disabled} onChange={() => onChange(r.weekday, { open: !r.open })} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
          <div className="weekday-hours-label">{WEEKDAY_NAMES[r.weekday]}</div>
          {r.open ? (
            <div className="weekday-hours-inputs">
              <input type="time" disabled={disabled} value={r.startTime} onChange={(e) => onChange(r.weekday, { startTime: e.target.value })} />
              <span className="muted">–</span>
              <input type="time" disabled={disabled} value={r.endTime} onChange={(e) => onChange(r.weekday, { endTime: e.target.value })} />
            </div>
          ) : (
            <div className="weekday-hours-off">Closed</div>
          )}
        </div>
      ))}
    </>
  );
}
