'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProviderOverviewRow } from '../lib/api';
import { IconAppointments, IconCalendar, IconClock, IconEdit, IconServices, IconTrash } from '../components/icons';

/**
 * The Staff roster — one row per person, grouped by whether they're on shift
 * today. Replaces the old data-table: a table put the two things an owner
 * actually does (see who's free, flip someone off) behind 24px icons in a
 * trailing column, and gave equal weight to columns nobody scans.
 *
 * Web renders rows, mobile renders cards from the same data (same pattern as
 * Bookings). Both share every handler — there is no mobile-only code path.
 */

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Four tints so a wall of avatars stays scannable; stable per person via name hash, never random. */
const AVATAR_TONES = ['tone-green', 'tone-purple', 'tone-peach', 'tone-blue'] as const;

export function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length]!;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function formatTime12h(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const period = h! >= 12 ? 'PM' : 'AM';
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Compact form for the tight mobile subtitle — "9 AM", "9:30 AM". */
function formatTimeShort(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const period = h! >= 12 ? 'PM' : 'AM';
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function toMinutes(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map(Number);
  return h! * 60 + m!;
}

/** True when this person is on shift today and nobody has flipped them off. */
export function isWorkingToday(p: ProviderOverviewRow): boolean {
  return Boolean(p.workingHoursTodayStart) && !p.unavailableToday;
}

/** "Back tomorrow, 9:00 AM" / "Back Friday, 9:00 AM" — the one thing worth knowing about someone who's off. */
export function backOnLabel(p: ProviderOverviewRow): string | null {
  if (!p.nextWorkingDay) return null;
  const { dayOffset, weekday, startTime } = p.nextWorkingDay;
  const when = dayOffset === 1 ? 'tomorrow' : WEEKDAY_NAMES[weekday] ?? '';
  return `Back ${when}, ${formatTime12h(startTime)}`;
}


/**
 * Jira GRW-183 — what to say about somebody who is not working right now.
 *
 * Three different situations that used to collapse into two strings:
 *
 *   - "called in sick"        → unavailableToday, today only
 *   - "day off"               → no hours TODAY, back on a named day
 *   - "nobody can book them"  → no hours on ANY day, ever, until somebody sets some
 *
 * The third used to read "No hours set", inferred from there being no next
 * working day within a week. It is now read from `hasWorkingHours` directly,
 * and it says what it means and what to do — an owner scanning the roster has
 * no way to know that "No hours set" is the difference between a quiet week and
 * a stylist the booking engine will never once offer.
 */
function shiftOffLabel(p: ProviderOverviewRow): string {
  if (p.unavailableToday) return 'Unavailable today';
  if (!p.hasWorkingHours) return 'Not bookable — add hours';
  return backOnLabel(p) ?? 'No hours today';
}

/**
 * Where the day is already sold, as percentages of the shift window. Bookings
 * outside the shift (an overrun, or hours edited after the fact) are clamped
 * rather than dropped, so the bar never silently under-reports a busy day.
 */
function shiftSegments(p: ProviderOverviewRow): { left: number; width: number }[] {
  if (!p.workingHoursTodayStart || !p.workingHoursTodayEnd) return [];
  const start = toMinutes(p.workingHoursTodayStart);
  const end = toMinutes(p.workingHoursTodayEnd);
  const span = end - start;
  if (span <= 0) return [];
  return p.todayBookedSegments
    .map((s) => {
      const from = Math.max(start, Math.min(end, s.startMin));
      const to = Math.max(start, Math.min(end, s.endMin));
      return { left: ((from - start) / span) * 100, width: ((to - from) / span) * 100 };
    })
    .filter((s) => s.width > 0);
}

export interface RosterActions {
  onToggleAvailable: (p: ProviderOverviewRow, available: boolean) => void;
  onEdit: (p: ProviderOverviewRow) => void;
  onSetActive: (p: ProviderOverviewRow, active: boolean) => void;
  /** Null while a row's request is in flight, so its switch can't be double-fired. */
  busyId: string | null;
}

function Switch({
  on,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="switch switch-lg" title={label}>
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </label>
  );
}

/**
 * Row overflow menu. Edit is promoted to its own labelled button beside this
 * (see StaffRow) — everything destructive lives in here behind a divider,
 * because a 24px bin one pixel from a 24px pencil is a mis-tap waiting to
 * delete someone's booking history.
 */
function RowMenu({ p, actions }: { p: ProviderOverviewRow; actions: RosterActions }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="staff-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`staff-icon-btn ${open ? 'is-open' : ''}`}
        aria-label={`More actions for ${p.displayName}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="staff-dots">⋯</span>
      </button>
      {open && (
        <div className="staff-menu" role="menu">
          <button type="button" className="sheet-item" role="menuitem" onClick={run(() => actions.onEdit(p))}>
            <IconEdit /> Edit details
          </button>
          <button type="button" className="sheet-item" role="menuitem" onClick={run(() => actions.onEdit(p))}>
            <IconClock /> Working hours
          </button>
          <button type="button" className="sheet-item" role="menuitem" onClick={run(() => actions.onEdit(p))}>
            <IconServices /> Services &amp; skills
          </button>
          <div className="staff-menu-divider" />
          {p.active ? (
            <button
              type="button"
              className="sheet-item sheet-danger"
              role="menuitem"
              onClick={run(() => actions.onSetActive(p, false))}
            >
              <IconTrash /> Remove from team
            </button>
          ) : (
            <button type="button" className="sheet-item" role="menuitem" onClick={run(() => actions.onSetActive(p, true))}>
              <IconAppointments /> Restore to team
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** One person, on shift or not. `off` switches to the quieter treatment. */
function StaffRow({
  p,
  off,
  topPerformerId,
  actions,
}: {
  p: ProviderOverviewRow;
  off: boolean;
  topPerformerId: string | null;
  actions: RosterActions;
}) {
  const busy = actions.busyId === p.id;
  const segments = shiftSegments(p);
  const freeAllDay = !off && p.todayBookings === 0;
  const isTop = p.id === topPerformerId;

  return (
    <div className={`staff-row ${off ? 'is-off' : ''}`}>
      <div className={`staff-avatar ${avatarTone(p.displayName)} ${off ? 'is-muted' : ''}`}>{initials(p.displayName)}</div>

      <div className="staff-identity">
        <div className="staff-identity-name">
          <button type="button" className="staff-name-btn" onClick={() => actions.onEdit(p)}>
            {p.displayName}
          </button>
          {isTop && <span className="staff-badge staff-badge-top">TOP</span>}
        </div>
        <div className="staff-identity-role">{p.title ?? '—'}</div>
      </div>

      <div className="staff-shift">
        {off ? (
          <span className="staff-shift-off">{shiftOffLabel(p)}</span>
        ) : (
          <>
            <div className="staff-shift-head">
              <span className="staff-shift-time">
                {formatTime12h(p.workingHoursTodayStart!)} – {formatTime12h(p.workingHoursTodayEnd!)}
              </span>
              {freeAllDay && <span className="staff-badge staff-badge-free">Free all day</span>}
            </div>
            <div className="staff-shift-bar" aria-hidden="true">
              {segments.map((s, i) => (
                <span key={i} className="staff-shift-seg" style={{ left: `${s.left}%`, width: `${s.width}%` }} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="staff-count">
        <span className={`staff-count-num ${p.todayBookings === 0 ? 'is-zero' : ''}`}>{p.todayBookings}</span>
        <span className="staff-count-label">bookings today</span>
      </div>

      <div className="staff-row-actions">
        {p.active ? (
          <>
            <span className="staff-toggle-label">{p.unavailableToday ? 'Off today' : 'Available'}</span>
            <Switch
              on={!p.unavailableToday}
              disabled={busy}
              label={`${p.displayName} available today`}
              onChange={(next) => actions.onToggleAvailable(p, next)}
            />
          </>
        ) : (
          <span className="staff-toggle-label">Inactive</span>
        )}
        <button type="button" className="staff-edit-btn" onClick={() => actions.onEdit(p)}>
          <IconEdit /> Edit
        </button>
        <RowMenu p={p} actions={actions} />
      </div>
    </div>
  );
}

/** Mobile card — the whole card opens the action sheet; only the switch stops the tap. */
function StaffCard({
  p,
  off,
  topPerformerId,
  actions,
  onOpenSheet,
}: {
  p: ProviderOverviewRow;
  off: boolean;
  topPerformerId: string | null;
  actions: RosterActions;
  onOpenSheet: (p: ProviderOverviewRow) => void;
}) {
  const busy = actions.busyId === p.id;
  const segments = shiftSegments(p);
  const freeAllDay = !off && p.todayBookings === 0;
  const isTop = p.id === topPerformerId;

  const hours =
    p.workingHoursTodayStart && p.workingHoursTodayEnd
      ? `${formatTimeShort(p.workingHoursTodayStart)} – ${formatTimeShort(p.workingHoursTodayEnd)}`
      : null;

  return (
    <div
      className={`staff-card ${off ? 'is-off' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenSheet(p)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenSheet(p))}
    >
      <div className="staff-card-top">
        <div className={`staff-avatar ${avatarTone(p.displayName)} ${off ? 'is-muted' : ''}`}>{initials(p.displayName)}</div>
        <div className="staff-card-identity">
          <div className="staff-identity-name">
            <span className="staff-card-name">{p.displayName}</span>
            {isTop && <span className="staff-badge staff-badge-top">TOP</span>}
            {freeAllDay && <span className="staff-badge staff-badge-free">FREE</span>}
          </div>
          <div className="staff-identity-role">
            {off ? shiftOffLabel(p) : `${p.title ?? '—'} · ${hours}`}
          </div>
        </div>
        {p.active ? (
          <span onClick={(e) => e.stopPropagation()}>
            <Switch
              on={!p.unavailableToday}
              disabled={busy}
              label={`${p.displayName} available today`}
              onChange={(next) => actions.onToggleAvailable(p, next)}
            />
          </span>
        ) : (
          <span className="staff-toggle-label">Inactive</span>
        )}
      </div>

      {!off && (
        <div className="staff-card-shift">
          <div className="staff-shift-bar" aria-hidden="true">
            {segments.map((s, i) => (
              <span key={i} className="staff-shift-seg" style={{ left: `${s.left}%`, width: `${s.width}%` }} />
            ))}
          </div>
          <span className={`staff-card-count ${p.todayBookings === 0 ? 'is-zero' : ''}`}>{p.todayBookings} today</span>
        </div>
      )}
    </div>
  );
}

/** Mobile action sheet — every option is a full-width 48px target, remove last and red. */
export function StaffActionSheet({
  p,
  actions,
  onClose,
}: {
  p: ProviderOverviewRow;
  actions: RosterActions;
  onClose: () => void;
}) {
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`Actions for ${p.displayName}`}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div className={`staff-avatar ${avatarTone(p.displayName)}`}>{initials(p.displayName)}</div>
          <div>
            <div className="sheet-title">{p.displayName}</div>
            <div className="sheet-sub">
              {p.title ?? '—'} · {p.todayBookings} booking{p.todayBookings === 1 ? '' : 's'} today
            </div>
          </div>
        </div>

        {/* Calendar, not the clock — the clock belongs to "Working hours" two rows
            down, and two identical glyphs in one sheet is a scanning tax. */}
        {p.active && (
          <div className="sheet-item staff-sheet-toggle">
            <IconCalendar /> Available today
            <span className="trail" onClick={(e) => e.stopPropagation()}>
              <Switch
                on={!p.unavailableToday}
                disabled={actions.busyId === p.id}
                label={`${p.displayName} available today`}
                onChange={(next) => actions.onToggleAvailable(p, next)}
              />
            </span>
          </div>
        )}

        <button type="button" className="sheet-item" onClick={run(() => actions.onEdit(p))}>
          <IconEdit /> Edit details
        </button>
        <button type="button" className="sheet-item" onClick={run(() => actions.onEdit(p))}>
          <IconClock /> Working hours
        </button>
        <button type="button" className="sheet-item" onClick={run(() => actions.onEdit(p))}>
          <IconServices /> Services &amp; skills
        </button>

        <div className="staff-menu-divider" />
        {p.active ? (
          <button type="button" className="sheet-item sheet-danger" onClick={run(() => actions.onSetActive(p, false))}>
            <IconTrash /> Remove from team
          </button>
        ) : (
          <button type="button" className="sheet-item" onClick={run(() => actions.onSetActive(p, true))}>
            <IconAppointments /> Restore to team
          </button>
        )}
      </div>
    </>
  );
}

/** A titled group ("Working today · 8") plus its rows/cards. Renders nothing when empty. */
export function StaffGroup({
  title,
  tone,
  people,
  off,
  topPerformerId,
  actions,
  onOpenSheet,
}: {
  title: string;
  tone: 'on' | 'off';
  people: ProviderOverviewRow[];
  off: boolean;
  topPerformerId: string | null;
  actions: RosterActions;
  onOpenSheet: (p: ProviderOverviewRow) => void;
}) {
  if (people.length === 0) return null;
  return (
    <>
      <div className="staff-group-head">
        <span className={`staff-group-dot ${tone === 'on' ? 'is-on' : ''}`} />
        <span className="staff-group-title">
          {title} · {people.length}
        </span>
      </div>
      <div className="staff-rows">
        {people.map((p) => (
          <StaffRow key={p.id} p={p} off={off} topPerformerId={topPerformerId} actions={actions} />
        ))}
      </div>
      <div className="staff-cards">
        {people.map((p) => (
          <StaffCard key={p.id} p={p} off={off} topPerformerId={topPerformerId} actions={actions} onOpenSheet={onOpenSheet} />
        ))}
      </div>
    </>
  );
}
