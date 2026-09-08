'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AttendanceRegister, AttendanceRow } from '../../lib/api';
import { isFutureMonth, monthLabel, shiftMonth } from './month';

/**
 * Jira GRW-63 · GRW-200 — one person's month.
 *
 * The register answers "who was here today". This answers the other question an
 * owner asks, usually at the end of a month and usually about one person: how
 * often did they come, how late, and how many hours.
 *
 * Read-only for everybody. Marking still happens on the register (GRW-192:
 * pay-adjacent, so nobody marks their own), and a stylist reaches this screen
 * for their OWN record — the API scopes it to them whatever id is in the URL,
 * so a colleague's link shows them their own month rather than a 403 they
 * would have to interpret.
 */

const STATUS = {
  present: { label: 'Present', tone: 'present' },
  late: { label: 'Came late', tone: 'late' },
  half_day: { label: 'Half day', tone: 'half_day' },
  leave: { label: 'On leave', tone: 'leave' },
  absent: { label: 'Absent', tone: 'absent' },
} as const;

type StatusKey = keyof typeof STATUS;
const ORDER: StatusKey[] = ['present', 'late', 'half_day', 'leave', 'absent'];

function toLocalTime(iso: string | null, timezone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );
}

/** Minutes between arrival and departure, or null when the day is not a worked span. */
function workedMinutes(row: AttendanceRow): number | null {
  if (!row.inAt || !row.outAt) return null;
  return Math.max(0, Math.round((Date.parse(row.outAt) - Date.parse(row.inAt)) / 60_000));
}

const hhmm = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;

export function AttendanceMonth({
  register,
  month,
  readOnly,
  backHref,
}: {
  register: AttendanceRegister;
  month: string;
  readOnly: boolean;
  /** Null for a stylist — the register they would go "back" to is not theirs to open. */
  backHref: string | null;
}) {
  const router = useRouter();
  const rows = register.rows;
  const person = rows[0];

  const summary = useMemo(() => {
    const counts: Record<StatusKey, number> = { present: 0, late: 0, half_day: 0, leave: 0, absent: 0 };
    let worked = 0;
    let rostered = 0;
    let unrecorded = 0;
    for (const r of rows) {
      if (r.status) counts[r.status as StatusKey]++;
      if (r.rostered) rostered++;
      if (r.rostered && !r.status) unrecorded++;
      const m = workedMinutes(r);
      if (m !== null) worked += m;
    }
    return { counts, worked, rostered, unrecorded };
  }, [rows]);

  /**
   * Days they were not rostered AND nobody marked are dropped from the list.
   *
   * A month has eight or nine of them and they carry no information — showing
   * thirty rows of which nine say "day off, nothing recorded" buries the four
   * that matter. A day off somebody DID mark stays, because that is somebody
   * saying something.
   */
  const visible = rows.filter((r) => r.rostered || r.status !== null);

  const go = (m: string) => router.push(`/attendance/${person?.providerId ?? ''}?month=${m}`);
  const atCurrentMonth = isFutureMonth(shiftMonth(month, 1), register.timezone);

  return (
    <div className="page-body att">
      <div className="att-head">
        <div>
          {backHref && (
            <Link href={backHref} className="am-back">
              ‹ All {register.rows.length === 0 ? 'staff' : 'staff'}
            </Link>
          )}
          <h2 className="att-title">{person?.displayName ?? 'Attendance'}</h2>
          <p className="att-sub">
            {person?.title ? `${person.title} · ` : ''}
            {readOnly ? 'Your attendance record.' : 'Their attendance, month by month.'}
          </p>
        </div>

        <div className="att-daynav">
          <button type="button" aria-label="Previous month" onClick={() => go(shiftMonth(month, -1))}>
            ‹
          </button>
          <div className="att-daynav-label">
            <div className="att-daynav-date">{monthLabel(month)}</div>
            <div className="att-daynav-sub">
              {summary.rostered} rostered · {summary.unrecorded} not recorded
            </div>
          </div>
          {/* Stopped at the current month: a register of days that have not
              happened records nothing, and the API refuses a future date. */}
          <button type="button" aria-label="Next month" disabled={atCurrentMonth} onClick={() => go(shiftMonth(month, 1))}>
            ›
          </button>
        </div>
      </div>

      <div className="att-summary">
        {ORDER.map((key) => (
          <div key={key} className="att-tile">
            <div className="att-tile-head">
              <span className={`att-dot att-swatch-${STATUS[key].tone}`} />
              <span>{STATUS[key].label}</span>
            </div>
            <div className="att-tile-count">{summary.counts[key]}</div>
          </div>
        ))}
        <div className="att-tile">
          <div className="att-tile-head">
            <span className="att-dot att-swatch-hours" />
            <span>Hours worked</span>
          </div>
          {/* Only from days with BOTH times. A month where nobody recorded
              departures would otherwise read as zero hours worked, which is a
              different claim from "we did not write it down". */}
          <div className="att-tile-count">{summary.worked > 0 ? hhmm(summary.worked) : '—'}</div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="att-list">
          <div className="att-empty">
            <div className="att-empty-title">Nothing recorded for {monthLabel(month)}</div>
            <div className="att-empty-sub">No shifts were rostered and no attendance was marked.</div>
          </div>
        </div>
      ) : (
        <div className="att-list am-days">
          {visible.map((row) => {
            const conf = row.status ? STATUS[row.status as StatusKey] : null;
            const mins = workedMinutes(row);
            const d = new Date(`${row.onDate}T12:00:00`);
            return (
              <div key={row.onDate} className={`am-day ${row.status ? '' : 'is-unmarked'}`}>
                <div className="am-date">
                  <span className="am-dom">{d.getDate()}</span>
                  <span className="am-dow">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                </div>
                <div className="am-body">
                  <div className="am-status">
                    {conf ? (
                      <span className={`att-chip att-chip-${conf.tone}`}>{conf.label}</span>
                    ) : (
                      <span className="att-unmarked">Not recorded</span>
                    )}
                    {!row.rostered && <span className="att-chip att-chip-off">Not rostered</span>}
                  </div>
                  {row.note && <div className="am-note">{row.note}</div>}
                </div>
                <div className="am-times">
                  {row.inAt ? (
                    <>
                      <span className="att-clock">
                        {toLocalTime(row.inAt, register.timezone)}
                        {' → '}
                        {row.outAt ? toLocalTime(row.outAt, register.timezone) : 'still in'}
                      </span>
                      {mins !== null && <span className="am-hours">{hhmm(mins)}</span>}
                    </>
                  ) : (
                    <span className="att-clock am-none">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="att-foot">
        <span>
          {readOnly
            ? 'Your record. Ask the salon to correct anything that looks wrong.'
            : 'Marked from the daily register.'}
        </span>
        <span>Times in local time · {register.timezone.replace('_', ' ')}</span>
      </div>
    </div>
  );
}
