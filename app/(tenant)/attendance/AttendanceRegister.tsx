'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AttendanceRegister as Register, type AttendanceRow } from '../lib/api';
import { pickNoun } from '../lib/nouns';
import { intlLocale } from './[providerId]/month';
import { useBranch } from '../components/BranchProvider';

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

/** The words for each status are `attendance.status.<key>`; only the colours live here. */
const STATUS = {
  present: { dot: 'var(--att-green)', tone: 'present' },
  late: { dot: 'var(--att-amber)', tone: 'late' },
  half_day: { dot: 'var(--att-blue)', tone: 'half_day' },
  leave: { dot: 'var(--att-purple)', tone: 'leave' },
  absent: { dot: 'var(--att-red)', tone: 'absent' },
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

/** The hours cell: a dash, "in progress", or a duration in minutes — the screen words it. */
function hoursCell(row: AttendanceRow, inTime: string, outTime: string): { kind: 'dash' | 'progress' | 'done'; mins: number; tone: string } {
  if (row.status && AWAY.has(row.status as StatusKey)) return { kind: 'dash', mins: 0, tone: 'muted' };
  if (!inTime) return { kind: 'dash', mins: 0, tone: 'muted' };
  if (!outTime) return { kind: 'progress', mins: 0, tone: 'live' };
  return { kind: 'done', mins: Math.max(0, minutesOf(outTime) - minutesOf(inTime)), tone: 'done' };
}

/** Local edits, so a row reads back what was typed while its save is in flight. */
type Draft = { inTime: string; outTime: string; status: StatusKey | null };

export function AttendanceRegister({
  initial,
  staffWord,
  /** Jira GRW-249 — a multi-branch owner's open branches, main first; empty hides the picker (BR-01). */
  branches = [],
}: {
  initial: Register;
  staffWord: string;
  branches?: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('attendance.register');
  const ts2 = useTranslations('attendance');
  const ts = useTranslations('attendance.status');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  const staffLower = pickNoun(locale, staffWord.toLowerCase(), tn('staff'));
  const [register, setRegister] = useState(initial);
  const [date, setDate] = useState(initial.date);
  /** Jira GRW-249 — the branch picked on the register; null is every branch. */
  const [branch, setBranch] = useState<string | null>(null);
  const branchContext = useBranch();
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

  async function load(nextDate: string, nextBranch: string | null = branch) {
    setBusy(true);
    setError(null);
    try {
      const next = await api.attendance(nextDate, undefined, undefined, nextBranch);
      setRegister(next);
      setDate(next.date);
      setBranch(nextBranch);
      setDrafts({});
      setOpenMenu(null);
    } catch {
      setError(t('errors.loadDay'));
    } finally {
      setBusy(false);
    }
  }

  /*
   * Jira GRW-395 — the register is the header's branch, and follows it when it changes, without leaving the day
   * the desk was on (GRW-249). Read once the browser can (`ready`, GRW-377). `branches` is empty for anyone but a
   * multi-branch owner (BR-01): a receptionist's register is already their own branch's.
   */
  useEffect(() => {
    if (!branchContext.ready) return;
    const wanted = branches.length > 1 ? branchContext.choice : null;
    if (wanted === branch) return;
    void load(date, wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchContext.ready, branchContext.choice]);

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
      const fresh = await api.attendance(date, undefined, undefined, branch);
      setRegister(fresh);
      setDrafts((d) => {
        const { [row.providerId]: _gone, ...rest } = d;
        return rest;
      });
      if (liveRef.current) liveRef.current.textContent = t('saved', { name: row.displayName });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.save'));
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
      const lateAfter = row.shiftStart === null ? null : minutesOf(row.shiftStart) + (register.lateGraceByProvider?.[row.providerId] ?? register.lateGraceMin);
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
      if (liveRef.current) liveRef.current.textContent = t('markedPresent', { count: unmarked.length });
    } catch {
      setError(t('errors.markAll'));
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
  const dateLabel = dayObj.toLocaleDateString(intlLocale(locale), { weekday: 'long', day: 'numeric', month: 'long' });
  const dateSub = isToday ? t('today') : date === addDays(register.today, -1) ? t('yesterday') : String(dayObj.getFullYear());
  const filterLabel = filter === 'all' ? t('allStaff', { label: staffLower }) : ts(filter);
  /** Jira GRW-249 — the picked branch's name, for the toolbar button and the empty state. */
  const branchName = branch ? (branches.find((b) => b.id === branch)?.name ?? t('thisBranch')) : null;
  const canMarkAll = rows.some((r) => r.rostered && !r.status);

  return (
    <div className="page-body att">
      <div className="att-head">
        <div>
          <h2 className="att-title">{t('heading')}</h2>
          <p className="att-sub">{t('sub')}</p>
        </div>

        {/* Day stepper rather than a bare date field: the register is worked
            one day at a time, and yesterday is one tap rather than a calendar. */}
        <div className="att-daynav">
          <button type="button" aria-label={t('prevDay')} disabled={busy} onClick={() => load(addDays(date, -1))}>
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
            aria-label={t('nextDay')}
            disabled={busy || isToday}
            onClick={() => load(addDays(date, 1))}
          >
            ›
          </button>
          <button type="button" className="att-daynav-today" disabled={busy || isToday} onClick={() => load(register.today)}>
            {t('today')}
          </button>
        </div>
      </div>

      <div className="att-summary">
        {ORDER.map((key) => (
          <div key={key} className="att-tile">
            <div className="att-tile-head">
              <span className="att-dot" style={{ background: STATUS[key].dot }} />
              <span>{ts(key)}</span>
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
            placeholder={t('searchPlaceholder', { label: staffLower })}
            aria-label={t('searchAria', { label: staffLower })}
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
            <span className="att-filter-key">{t('statusKey')}</span> {filterLabel}
            <span className="att-caret" aria-hidden="true">▾</span>
          </button>
          {openMenu === 'filter' && (
            <div className="att-menu" role="listbox">
              <button type="button" role="option" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => { setFilter('all'); setOpenMenu(null); }}>
                <span className="att-dot att-dot-any" />
                {t('allStaff', { label: staffLower })}
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
                  {ts(key)}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="att-markall" disabled={busy || !canMarkAll} onClick={() => void markAllPresent()}>
          <span aria-hidden="true">✓</span> {t('markAll')}
        </button>
      </div>

      {error && <div role="alert" className="banner banner-error att-error">{error}</div>}

      <div className="att-list">
        {filtered.length === 0 ? (
          <div className="att-empty">
            <div className="att-empty-title">
              {rows.length === 0
                ? // Jira GRW-249 — "nobody here" and "nobody at THIS BRANCH" are
                  // different facts; naming the branch says which one it is.
                  branchName
                  ? t('emptyBranch', { branch: branchName })
                  : t('emptyNone', { label: staffLower })
                : t('emptyNoMatch', { label: staffLower })}
            </div>
            <div className="att-empty-sub">
              {rows.length === 0
                ? branchName
                  ? t('emptyBranchSub')
                  : t('emptyNoneSub')
                : t('emptyNoMatchSub')}
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
                    {/* GRW-200 — the name opens their month. The register
                        answers "who was here today"; this is the other question
                        an owner asks, usually at the end of a month and usually
                        about one person. */}
                    <a className="att-name att-name-link" href={`/attendance/${row.providerId}`}>
                      {row.displayName}
                    </a>
                    {/* The design's "role" line. Their real title, and when
                        there is none, the fact that carries more for a
                        register: whether they were meant to be in at all. */}
                    <span className="att-role">{row.title ?? (row.rostered ? t('from', { time: row.shiftStart ?? '' }) : t('notRostered'))}</span>
                  </span>
                </div>

                <div className="att-controls">
                  <label className="att-field">
                    <span className="att-field-label">{t('inTime')}</span>
                    <span className="att-timeset">
                      <input
                        type="time"
                        value={view.inTime}
                        disabled={busy || away}
                        onChange={(e) => timeChanged(row, 'inTime', e.target.value)}
                      />
                      <button type="button" title={t('setNow')} disabled={busy || away} onClick={() => setNow(row, 'inTime')}>
                        {t('now')}
                      </button>
                    </span>
                  </label>

                  <label className="att-field">
                    <span className="att-field-label">{t('outTime')}</span>
                    <span className="att-timeset">
                      <input
                        type="time"
                        value={view.outTime}
                        disabled={busy || away}
                        onChange={(e) => timeChanged(row, 'outTime', e.target.value)}
                      />
                      <button type="button" title={t('setNow')} disabled={busy || away} onClick={() => setNow(row, 'outTime')}>
                        {t('now')}
                      </button>
                    </span>
                  </label>

                  <div className="att-field att-field-hours">
                    <span className="att-field-label">{t('hours')}</span>
                    <span className={`att-hours att-hours-${hrs.tone}`}>
                      {hrs.kind === 'dash' ? '—' : hrs.kind === 'progress' ? t('inProgress') : ts2('hoursFormat', { hours: Math.floor(hrs.mins / 60), minutes: String(hrs.mins % 60).padStart(2, '0') })}
                    </span>
                  </div>

                  <div className="att-field att-menu-anchor">
                    <span className="att-field-label">{t('statusLabel')}</span>
                    <button
                      type="button"
                      className={`att-pill ${conf ? `att-pill-${conf.tone}` : 'att-pill-none'}`}
                      aria-haspopup="listbox"
                      aria-expanded={openMenu === row.providerId}
                      disabled={busy}
                      onClick={() => setOpenMenu((m) => (m === row.providerId ? null : row.providerId))}
                    >
                      <span className="att-dot" style={conf ? { background: conf.dot } : undefined} />
                      <span className="att-pill-text">{view.status ? ts(view.status) : t('markStatus')}</span>
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
                            {ts(key)}
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
                                setError(t('errors.undo'));
                                setBusy(false);
                              }
                            }}
                          >
                            {t('clearEntry')}
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
                    aria-label={row.note ? t('noteWith', { note: row.note }) : t('addNote')}
                    title={row.note ?? t('addNote')}
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
                        placeholder={t('notePlaceholder')}
                        disabled={busy || !view.status}
                        aria-label={t('noteAria', { name: row.displayName })}
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
                            .catch(() => setError(t('errors.note')));
                        }}
                      />
                    ) : (
                      <span className="att-note-text">{row.note}</span>
                    )}
                    {noteFor === row.providerId && !view.status && (
                      <span className="att-note-hint">{t('noteNeedsStatus')}</span>
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
          {t('marked', { marked, total: rows.length, label: staffLower })}
        </span>
        <span>{t('tzFoot', { tz: register.timezone.replace('_', ' ') })}</span>
      </div>

      {/* Saves happen on change with no Save button, so the only other signal
          a screen reader gets is the row re-rendering silently. */}
      <p ref={liveRef} className="sr-only" role="status" aria-live="polite" />

      {openMenu !== null && <div className="att-scrim" onClick={() => setOpenMenu(null)} aria-hidden="true" />}
    </div>
  );
}
