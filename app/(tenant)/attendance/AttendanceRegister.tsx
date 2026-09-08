'use client';

import { useMemo, useState } from 'react';
import { api, type AttendanceRegister as Register, type AttendanceRow } from '../lib/api';

/**
 * Jira GRW-63 · GRW-170 — the register.
 *
 * One row per person per day, INCLUDING the people nobody marked. A register
 * that listed only the entries somebody made would answer "who did we record?"
 * when the question is "who was here?" — and the gap between those two is
 * exactly what an owner is looking for.
 */

const STATUSES = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'half_day', label: 'Half day' },
  { value: 'absent', label: 'Absent' },
  { value: 'leave', label: 'Leave' },
] as const;

/** Statuses that mean the person was not there, so the time fields have nothing to say. Mirrors the schema's own `attendance_away_has_no_times`. */
const AWAY = new Set(['absent', 'leave']);

const labelFor = (status: string | null) => STATUSES.find((s) => s.value === status)?.label ?? null;

/** An instant back to "HH:mm" in the salon's zone — the same wall clock the desk typed. */
function toLocalTime(iso: string | null, timezone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

interface Draft {
  status: string;
  inTime: string;
  outTime: string;
  note: string;
}

const draftFrom = (row: AttendanceRow, timezone: string): Draft => ({
  status: row.status ?? 'present',
  inTime: toLocalTime(row.inAt, timezone),
  outTime: toLocalTime(row.outAt, timezone),
  note: row.note ?? '',
});

export function AttendanceRegister({ initial, staffWord }: { initial: Register; staffWord: string }) {
  const [register, setRegister] = useState(initial);
  const [date, setDate] = useState(initial.date);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = register.rows;
  const isFuture = date > register.today;

  const tally = useMemo(() => {
    const rostered = rows.filter((r) => r.rostered).length;
    const marked = rows.filter((r) => r.status !== null).length;
    const inNow = rows.filter((r) => r.inAt && !r.outAt).length;
    const away = rows.filter((r) => r.status && AWAY.has(r.status)).length;
    return { rostered, marked, inNow, away, unmarked: rows.filter((r) => r.rostered && r.status === null).length };
  }, [rows]);

  async function load(nextDate: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await api.attendance(nextDate);
      setRegister(next);
      setDate(next.date);
      setEditing(null);
    } catch {
      setError('Could not load that day.');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: AttendanceRow) {
    setEditing(row.providerId);
    setDraft(draftFrom(row, register.timezone));
    setError(null);
  }

  async function save(providerId: string) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const away = AWAY.has(draft.status);
    try {
      await api.markAttendance({
        providerId,
        date,
        status: draft.status,
        // Cleared rather than sent, so switching "present 10:02" to "absent"
        // does not leave a time behind for a payroll export to find.
        inTime: away ? null : draft.inTime || null,
        outTime: away ? null : draft.outTime || null,
        note: draft.note || null,
      });
      await load(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      setBusy(false);
    }
  }

  async function clear(providerId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.clearAttendance(providerId, date);
      await load(date);
    } catch {
      setError('Could not undo that.');
      setBusy(false);
    }
  }

  return (
    <div className="page-body">
      <div className="card att-controls">
        <label htmlFor="att-date">Day</label>
        <input
          id="att-date"
          type="date"
          value={date}
          max={register.today}
          disabled={busy}
          onChange={(e) => load(e.target.value)}
        />
        {date !== register.today && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => load(register.today)}>
            Today
          </button>
        )}
      </div>

      {/* Rostered vs marked, because the useful number is the one nobody
          filled in. "5 staff, 3 marked" is the prompt; "3 present" is not. */}
      <div className="card att-tally">
        <span>
          <strong>{tally.rostered}</strong> rostered
        </span>
        <span>
          <strong>{tally.marked}</strong> marked
        </span>
        <span>
          <strong>{tally.inNow}</strong> still in
        </span>
        {tally.unmarked > 0 && (
          <span className="att-tally-gap">
            <strong>{tally.unmarked}</strong> not recorded
          </span>
        )}
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty">No {staffWord.toLowerCase()} yet.</div>
        </div>
      ) : (
        <div className="card att-list">
          {rows.map((row) => {
            const open = editing === row.providerId;
            const away = draft ? AWAY.has(draft.status) : false;
            return (
              <div key={row.providerId} className={`att-row ${row.status ? 'is-marked' : ''}`}>
                <div className="att-row-head">
                  <div className="att-name">
                    {row.displayName}
                    {!row.rostered && <span className="att-chip att-chip-off">Not rostered</span>}
                  </div>
                  <div className="att-times">
                    {row.status === null ? (
                      <span className="att-unmarked">Not recorded</span>
                    ) : (
                      <>
                        <span className={`att-chip att-chip-${row.status}`}>{labelFor(row.status)}</span>
                        {row.inAt && (
                          <span className="att-clock">
                            {toLocalTime(row.inAt, register.timezone)}
                            {' → '}
                            {row.outAt ? toLocalTime(row.outAt, register.timezone) : 'still in'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {!isFuture && (
                    <button type="button" className="btn-ghost" disabled={busy} onClick={() => (open ? setEditing(null) : startEdit(row))}>
                      {open ? 'Close' : row.status ? 'Edit' : 'Mark'}
                    </button>
                  )}
                </div>

                {open && draft && (
                  <div className="att-edit">
                    <label>
                      Status
                      <select value={draft.status} disabled={busy} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {/* Hidden rather than disabled when the status means they
                        were not here: a greyed-out "in" time next to "Absent"
                        invites the question of what it would have meant. */}
                    {!away && (
                      <>
                        <label>
                          In
                          <input type="time" value={draft.inTime} disabled={busy} onChange={(e) => setDraft({ ...draft, inTime: e.target.value })} />
                        </label>
                        <label>
                          Out
                          <input type="time" value={draft.outTime} disabled={busy} onChange={(e) => setDraft({ ...draft, outTime: e.target.value })} />
                        </label>
                      </>
                    )}
                    <label className="att-note">
                      Note
                      <input type="text" value={draft.note} maxLength={200} disabled={busy} placeholder="Optional" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </label>
                    <div className="att-actions">
                      <button type="button" className="btn-primary" disabled={busy} onClick={() => save(row.providerId)}>
                        Save
                      </button>
                      {row.status !== null && (
                        <button type="button" className="btn-ghost btn-danger" disabled={busy} onClick={() => clear(row.providerId)}>
                          Undo
                        </button>
                      )}
                    </div>
                    {row.markedAt && (
                      <p className="att-meta">
                        Last saved by {row.markedByName ?? 'someone'} ·{' '}
                        {new Intl.DateTimeFormat('en-GB', {
                          timeZone: register.timezone,
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(row.markedAt))}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
