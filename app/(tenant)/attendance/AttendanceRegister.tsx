'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AttendanceRegister as Register, type AttendanceRow } from '../lib/api';

/**
 * Jira GRW-63 · GRW-170 — the attendance register, built to Attendance.dc.html.
 *
 * The design's shape, which is the right one for a desk: every control is
 * INLINE on the row. In time, out time, hours and status are all one tap from
 * the list, with no edit mode to enter and leave — a manager marking eight
 * people at 10am should not open and close eight panels.
 *
 * Three places the mock could not know the truth, and this does:
 *
 * 1. **Late is late for THEIR shift.** The mock compares every arrival to one
 *    salon-wide `lateThreshold` prop (09:30). Growza knows each person's own
 *    rostered start (GRW-191), so 09:47 is late for a 09:00 shift and early
 *    for a 10:00 one — plus the salon's own grace period, which IS a setting
 *    because it is the one part of lateness no schedule can answer.
 * 2. **"Mark all present" skips people who are not rostered**, as well as the
 *    mock's leave/absent. Marking somebody present on their day off is not a
 *    shortcut, it is a wrong record.
 * 3. **The roster is real**, so avatar colours are hashed from the provider's
 *    own name rather than taken from a fixed six-colour rotation over a fixed
 *    eight-person cast.
 */

const STATUS = {
  present: { label: 'Present', dot: 'var(--att-green)', tone: 'present' },
  late: { label: 'Came late', dot: 'var(--att-amber)', tone: 'late' },
  half_day: { label: 'Half day', dot: 'var(--att-blue)', tone: 'half_day' },
  leave: { label: 'On leave', dot: 'var(--att-purple)', tone: 'leave' },
  absent: { label: 'Absent', dot: 'var(--att-red)', tone: 'absent' },
} as const;

type StatusKey = keyof typeof STATUS;

/** The design's own order, top to bottom, in both the summary tiles and the status menu. */
const ORDER: StatusKey[] = ['present', 'late', 'half_day', 'leave', 'absent'];

/** Statuses that mean the person was not there, so they carry no times. Mirrors the schema's `attendance_away_has_no_times`. */
const AWAY = new Set<StatusKey>(['leave', 'absent']);

/**
 * A stable hue from the name, not a rotation over list position.
 *
 * Same function the Bookings timeline uses for its staff rails, so one person
 * is the same colour wherever they appear. The mock indexed a six-colour table
 * by roster position, which would repaint everybody the day somebody is hired.
 */
function staffHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** An instant back to the salon's own wall clock — the same "HH:mm" the desk typed. */
function toLocalTime(iso: string | null, timezone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function addDays(dateISO: string, delta: number): string {
  const d = new Date(`${dateISO}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return new Intl.DateTimeFormat('en-CA').format(d);
}

/** "8h 05m", or the state that is not a duration yet. */
function hoursCell(row: AttendanceRow, inTime: string, outTime: string): { label: string; tone: string } {
  if (row.status && AWAY.has(row.status as StatusKey)) return { label: '—', tone: 'muted' };
  if (!inTime) return { label: '—', tone: 'muted' };
  if (!outTime) return { label: 'In progress', tone: 'live' };
  const mins = Math.max(0, minutesOf(outTime) - minutesOf(inTime));
  return { label: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`, tone: 'done' };
}

/** Local edits, so a row reads back what was typed while its save is in flight. */
type Draft = { inTime: string; outTime: string; status: StatusKey | null };

export function AttendanceRegister({ initial, staffWord }: { initial: Register; staffWord: string }) {
  const [register, setRegister] = useState(initial);
  const [date, setDate] = useState(initial.date);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | StatusKey>('all');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);

  const rows = register.rows;
  const tz = register.timezone;

  /** The row as it should READ: the draft if this row has unsaved edits, else the server's. */
  const viewOf = (row: AttendanceRow): Draft =>
    drafts[row.providerId] ?? {
      inTime: toLocalTime(row.inAt, tz),
      outTime: toLocalTime(row.outAt, tz),
      status: (row.status as StatusKey) ?? null,
    };

  useEffect(() => {
    if (openMenu === null) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [openMenu]);

  async function load(nextDate: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await api.attendance(nextDate);
      setRegister(next);
      setDate(next.date);
      setDrafts({});
      setOpenMenu(null);
    } catch {
      setError('Could not load that day.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Write one row and take the server's answer back.
   *
   * Optimistic in the draft, authoritative from the reload: switching to
   * "On leave" clears the times server-side, and the row has to show that
   * rather than keep the numbers the desk can still see.
   */
  async function save(row: AttendanceRow, next: Draft) {
    setDrafts((d) => ({ ...d, [row.providerId]: next }));
    if (!next.status) return;
    const away = AWAY.has(next.status);
    setBusy(true);
    setError(null);
    try {
      await api.markAttendance({
        providerId: row.providerId,
        date,
        status: next.status,
        inTime: away ? null : next.inTime || null,
        outTime: away ? null : next.outTime || null,
        note: row.note,
      });
      const fresh = await api.attendance(date);
      setRegister(fresh);
      setDrafts((d) => {
        const { [row.providerId]: _gone, ...rest } = d;
        return rest;
      });
      if (liveRef.current) liveRef.current.textContent = `${row.displayName} saved.`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      // The draft stays, so the desk can see and fix what was rejected.
    } finally {
      setBusy(false);
    }
  }

  /**
   * Typing an arrival on an unmarked row decides the status for you — present,
   * or late against THAT PERSON'S rostered start. Somebody with no shift on
   * record cannot be late for it, so they read present.
   */
  function timeChanged(row: AttendanceRow, field: 'inTime' | 'outTime', value: string) {
    const view = viewOf(row);
    const next: Draft = { ...view, [field]: value };
    if (field === 'inTime' && value && !view.status) {
      // Late past their own start PLUS the salon's grace (GRW-170). Strict to
      // the minute made 10:01 on a 10:00 shift "came late", which is an
      // argument rather than a record.
      const lateAfter = row.shiftStart === null ? null : minutesOf(row.shiftStart) + register.lateGraceMin;
      next.status = lateAfter !== null && minutesOf(value) > lateAfter ? 'late' : 'present';
    }
    void save(row, next);
  }

  function setNow(row: AttendanceRow, field: 'inTime' | 'outTime') {
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(
      new Date(),
    );
    timeChanged(row, field, now);
  }

  /**
   * Everybody who was meant to be here and has not been marked otherwise.
   *
   * Skips leave and absent, as the design does — and also skips anybody not
   * rostered today, which the mock's fixed cast had no way to express. Marking
   * somebody present on their day off is not a shortcut, it is a wrong record.
   */
  async function markAllPresent() {
    const targets = rows.filter((r) => r.rostered && (!r.status || r.status === 'present'));
    const unmarked = targets.filter((r) => !r.status);
    if (unmarked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const row of unmarked) {
        await api.markAttendance({
          providerId: row.providerId,
          date,
          status: 'present',
          // Their own shift start, not one salon-wide default — the same
          // reason lateness is measured per person.
          inTime: row.shiftStart,
          outTime: null,
          note: row.note,
        });
      }
      await load(date);
      if (liveRef.current) liveRef.current.textContent = `${unmarked.length} marked present.`;
    } catch {
      setError('Could not mark everyone. Some rows may have saved.');
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { present: 0, late: 0, half_day: 0, leave: 0, absent: 0 };
    for (const r of rows) if (r.status) c[r.status as StatusKey]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (q && !(r.displayName.toLowerCase().includes(q) || (r.title ?? '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, search, filter]);

  const marked = rows.filter((r) => r.status !== null).length;
  const isToday = date === register.today;
  const dayObj = new Date(`${date}T12:00:00`);
  const dateLabel = dayObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateSub = isToday ? 'Today' : date === addDays(register.today, -1) ? 'Yesterday' : String(dayObj.getFullYear());
  const filterLabel = filter === 'all' ? `All ${staffWord.toLowerCase()}` : STATUS[filter].label;
  const canMarkAll = rows.some((r) => r.rostered && !r.status);

  return (
    <div className="page-body att">
      <div className="att-head">
        <div>
          <h2 className="att-title">Staff attendance</h2>
          <p className="att-sub">Mark in-time, out-time and daily status for your team.</p>
        </div>

        {/* Day stepper rather than a bare date field: the register is worked
            one day at a time, and yesterday is one tap rather than a calendar. */}
        <div className="att-daynav">
          <button type="button" aria-label="Previous day" disabled={busy} onClick={() => load(addDays(date, -1))}>
            ‹
          </button>
          <div className="att-daynav-label">
            <div className="att-daynav-date">{dateLabel}</div>
            <div className="att-daynav-sub">{dateSub}</div>
          </div>
          {/* Disabled on today. The API refuses a future date (a register of a
              day that has not happened records nothing), so an enabled arrow
              would walk the desk into a wall. */}
          <button
            type="button"
            aria-label="Next day"
            disabled={busy || isToday}
            onClick={() => load(addDays(date, 1))}
          >
            ›
          </button>
          <button type="button" className="att-daynav-today" disabled={busy || isToday} onClick={() => load(register.today)}>
            Today
          </button>
        </div>
      </div>

      <div className="att-summary">
        {ORDER.map((key) => (
          <div key={key} className="att-tile">
            <div className="att-tile-head">
              <span className="att-dot" style={{ background: STATUS[key].dot }} />
              <span>{STATUS[key].label}</span>
            </div>
            <div className="att-tile-count">{counts[key]}</div>
          </div>
        ))}
      </div>

      <div className="att-toolbar">
        <div className="att-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            placeholder={`Search ${staffWord.toLowerCase()} by name or role`}
            aria-label={`Search ${staffWord.toLowerCase()}`}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="att-menu-anchor">
          <button
            type="button"
            className="att-filter"
            aria-haspopup="listbox"
            aria-expanded={openMenu === 'filter'}
            onClick={() => setOpenMenu((m) => (m === 'filter' ? null : 'filter'))}
          >
            <span className="att-filter-key">Status:</span> {filterLabel}
            <span className="att-caret" aria-hidden="true">▾</span>
          </button>
          {openMenu === 'filter' && (
            <div className="att-menu" role="listbox">
              <button type="button" role="option" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => { setFilter('all'); setOpenMenu(null); }}>
                <span className="att-dot att-dot-any" />
                All {staffWord.toLowerCase()}
              </button>
              {ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={filter === key}
                  className={filter === key ? 'is-on' : ''}
                  onClick={() => { setFilter(key); setOpenMenu(null); }}
                >
                  <span className="att-dot" style={{ background: STATUS[key].dot }} />
                  {STATUS[key].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="att-markall" disabled={busy || !canMarkAll} onClick={() => void markAllPresent()}>
          <span aria-hidden="true">✓</span> Mark all present
        </button>
      </div>

      {error && <div className="banner banner-error att-error">{error}</div>}

      <div className="att-list">
        {filtered.length === 0 ? (
          <div className="att-empty">
            <div className="att-empty-title">
              {rows.length === 0 ? `No ${staffWord.toLowerCase()} yet` : `No ${staffWord.toLowerCase()} match your filters`}
            </div>
            <div className="att-empty-sub">
              {rows.length === 0 ? 'Add someone to the team and they will appear here.' : 'Try clearing the search or status filter.'}
            </div>
          </div>
        ) : (
          filtered.map((row) => {
            const view = viewOf(row);
            const conf = view.status ? STATUS[view.status] : null;
            const hrs = hoursCell(row, view.inTime, view.outTime);
            const away = view.status ? AWAY.has(view.status) : false;
            const hue = staffHue(row.displayName);
            return (
              <div key={row.providerId} className={`att-row ${row.rostered ? '' : 'is-off'}`}>
                <div className="att-who">
                  <span
                    className="att-avatar"
                    style={{ background: `oklch(0.94 0.04 ${hue})`, color: `oklch(0.40 0.10 ${hue})` }}
                    aria-hidden="true"
                  >
                    {initialsOf(row.displayName)}
                  </span>
                  <span className="att-who-text">
                    <span className="att-name">{row.displayName}</span>
                    {/* The design's "role" line. Their real title, and when
                        there is none, the fact that carries more for a
                        register: whether they were meant to be in at all. */}
                    <span className="att-role">{row.title ?? (row.rostered ? `From ${row.shiftStart}` : 'Not rostered')}</span>
                  </span>
                </div>

                <div className="att-controls">
                  <label className="att-field">
                    <span className="att-field-label">In time</span>
                    <span className="att-timeset">
                      <input
                        type="time"
                        value={view.inTime}
                        disabled={busy || away}
                        onChange={(e) => timeChanged(row, 'inTime', e.target.value)}
                      />
                      <button type="button" title="Set to now" disabled={busy || away} onClick={() => setNow(row, 'inTime')}>
                        Now
                      </button>
                    </span>
                  </label>

                  <label className="att-field">
                    <span className="att-field-label">Out time</span>
                    <span className="att-timeset">
                      <input
                        type="time"
                        value={view.outTime}
                        disabled={busy || away}
                        onChange={(e) => timeChanged(row, 'outTime', e.target.value)}
                      />
                      <button type="button" title="Set to now" disabled={busy || away} onClick={() => setNow(row, 'outTime')}>
                        Now
                      </button>
                    </span>
                  </label>

                  <div className="att-field att-field-hours">
                    <span className="att-field-label">Hours</span>
                    <span className={`att-hours att-hours-${hrs.tone}`}>{hrs.label}</span>
                  </div>

                  <div className="att-field att-menu-anchor">
                    <span className="att-field-label">Status</span>
                    <button
                      type="button"
                      className={`att-pill ${conf ? `att-pill-${conf.tone}` : 'att-pill-none'}`}
                      aria-haspopup="listbox"
                      aria-expanded={openMenu === row.providerId}
                      disabled={busy}
                      onClick={() => setOpenMenu((m) => (m === row.providerId ? null : row.providerId))}
                    >
                      <span className="att-dot" style={conf ? { background: conf.dot } : undefined} />
                      <span className="att-pill-text">{conf ? conf.label : 'Mark status'}</span>
                      <span className="att-caret" aria-hidden="true">▾</span>
                    </button>
                    {openMenu === row.providerId && (
                      <div className="att-menu att-menu-right" role="listbox">
                        {ORDER.map((key) => (
                          <button
                            key={key}
                            type="button"
                            role="option"
                            aria-selected={view.status === key}
                            className={view.status === key ? 'is-on' : ''}
                            onClick={() => {
                              setOpenMenu(null);
                              void save(row, { ...view, status: key });
                            }}
                          >
                            <span className="att-dot" style={{ background: STATUS[key].dot }} />
                            {STATUS[key].label}
                          </button>
                        ))}
                        {view.status && (
                          <button
                            type="button"
                            className="att-menu-clear"
                            onClick={async () => {
                              setOpenMenu(null);
                              setBusy(true);
                              try {
                                await api.clearAttendance(row.providerId, date);
                                await load(date);
                              } catch {
                                setError('Could not undo that.');
                                setBusy(false);
                              }
                            }}
                          >
                            Clear entry
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Not in the mock, and one tap out of the way so it does not
                      compete with the four columns that are: the note column
                      exists in the schema, and a field nothing can write is a
                      column that quietly stays empty forever. */}
                  <button
                    type="button"
                    className={`att-note-toggle ${row.note ? 'has-note' : ''}`}
                    aria-label={row.note ? `Note: ${row.note}` : 'Add a note'}
                    title={row.note ?? 'Add a note'}
                    disabled={busy}
                    onClick={() => setNoteFor((n) => (n === row.providerId ? null : row.providerId))}
                  >
                    {row.note ? '🗒' : '＋'}
                  </button>
                </div>

                {(noteFor === row.providerId || (row.note && noteFor === null)) && (
                  <div className="att-noterow">
                    {noteFor === row.providerId ? (
                      <input
                        type="text"
                        maxLength={200}
                        autoFocus
                        defaultValue={row.note ?? ''}
                        placeholder="Note — dentist, covering for Farah…"
                        disabled={busy || !view.status}
                        aria-label={`Note for ${row.displayName}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setNoteFor(null);
                          if (e.key !== 'Enter' || !view.status) return;
                          const text = (e.target as HTMLInputElement).value.trim();
                          setNoteFor(null);
                          void api
                            .markAttendance({
                              providerId: row.providerId,
                              date,
                              status: view.status,
                              inTime: away ? null : view.inTime || null,
                              outTime: away ? null : view.outTime || null,
                              note: text || null,
                            })
                            .then(() => load(date))
                            .catch(() => setError('Could not save that note.'));
                        }}
                      />
                    ) : (
                      <span className="att-note-text">{row.note}</span>
                    )}
                    {noteFor === row.providerId && !view.status && (
                      <span className="att-note-hint">Set a status first — a note needs a day to belong to.</span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="att-foot">
        <span>
          {marked} of {rows.length} {staffWord.toLowerCase()} marked
        </span>
        <span>Times shown in local time · {register.timezone.replace('_', ' ')}</span>
      </div>

      {/* Saves happen on change with no Save button, so the only other signal
          a screen reader gets is the row re-rendering silently. */}
      <p ref={liveRef} className="sr-only" role="status" aria-live="polite" />

      {openMenu !== null && <div className="att-scrim" onClick={() => setOpenMenu(null)} aria-hidden="true" />}
    </div>
  );
}
