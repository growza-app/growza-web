'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AttendanceRegister, AttendanceRow } from '../../lib/api';
import { intlLocale, isFutureMonth, monthLabel, shiftMonth } from './month';
import { weekdayNames } from '../../lib/weekday-names';

/**
 * Jira GRW-63 · GRW-201 — one person's month, as a calendar.
 *
 * This was a list of thirty rows. A calendar answers the question the screen
 * exists for in one glance: a month of green with two amber days reads as
 * "reliable, twice late" before anybody has read a word. Thirty rows makes the
 * reader count.
 *
 * Colour carries the status and is never the ONLY thing that does — every cell
 * also shows a letter, and the selected day spells the status out in full.
 * About one man in twelve cannot reliably separate the green from the red.
 */

/** Words and the one-letter marks are `attendance.status` / `attendance.statusShort`; only the tone lives here. */
const STATUS = {
  present: { tone: 'present' },
  late: { tone: 'late' },
  half_day: { tone: 'half_day' },
  leave: { tone: 'leave' },
  absent: { tone: 'absent' },
} as const;

type StatusKey = keyof typeof STATUS;
const ORDER: StatusKey[] = ['present', 'late', 'half_day', 'leave', 'absent'];

function toLocalTime(iso: string | null, timezone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );
}

function workedMinutes(row: AttendanceRow): number | null {
  if (!row.inAt || !row.outAt) return null;
  return Math.max(0, Math.round((Date.parse(row.outAt) - Date.parse(row.inAt)) / 60_000));
}

/**
 * The class that colours a cell.
 *
 * Four states, and the last two are different on purpose: a day nobody was
 * rostered for is a day off, and a rostered day nobody marked is an omission.
 * Painting both grey would hide the only thing on this screen an owner can act
 * on.
 */
function cellTone(row: AttendanceRow): string {
  if (row.status) return `am-c-${STATUS[row.status as StatusKey].tone}`;
  return row.rostered ? 'am-c-unmarked' : 'am-c-off';
}

export function AttendanceMonth({
  register,
  month,
  readOnly,
  backHref,
}: {
  register: AttendanceRegister;
  month: string;
  readOnly: boolean;
  backHref: string | null;
}) {
  const t = useTranslations('attendance.month');
  const ta = useTranslations('attendance');
  const ts = useTranslations('attendance.status');
  const tss = useTranslations('attendance.statusShort');
  const locale = useLocale();
  const dow = weekdayNames(locale).short; // Sunday-first, matching `working_hours.weekday` (0=Sun) and the weekday editor
  const hhmm = (mins: number) => ta('hoursFormat', { hours: Math.floor(mins / 60), minutes: String(mins % 60).padStart(2, '0') });
  const router = useRouter();
  const rows = register.rows;
  const person = rows[0];
  const [selected, setSelected] = useState<string | null>(null);

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
   * Blank cells before the 1st, so the month sits under the right weekday
   * columns. Derived from the row's own local date rather than a Date the
   * browser builds in its own zone — the register is keyed on the salon's
   * dates, and the two disagree for five and a half hours every day.
   */
  const leadingBlanks = useMemo(() => {
    const first = rows[0]?.onDate;
    if (!first) return 0;
    const [y, m, d] = first.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  }, [rows]);

  const go = (m: string) => router.push(`/attendance/${person?.providerId ?? ''}?month=${m}`);
  const atCurrentMonth = isFutureMonth(shiftMonth(month, 1), register.timezone);
  const chosen = selected ? rows.find((r) => r.onDate === selected) : undefined;
  const chosenMins = chosen ? workedMinutes(chosen) : null;

  return (
    <div className="page-body att">
      <div className="att-head">
        <div>
          {backHref && (
            <Link href={backHref} className="am-back">
              {t('back')}
            </Link>
          )}
          <h2 className="att-title">{person?.displayName ?? ta('title')}</h2>
          <p className="att-sub">
            {person?.title ? `${person.title} · ` : ''}
            {readOnly ? t('own') : t('theirs')}
          </p>
        </div>

        <div className="att-daynav">
          <button type="button" aria-label={t('prevMonth')} onClick={() => go(shiftMonth(month, -1))}>
            ‹
          </button>
          <div className="att-daynav-label">
            <div className="att-daynav-date">{monthLabel(month, locale)}</div>
            <div className="att-daynav-sub">
              {t('rosteredCount', { rostered: summary.rostered, unrecorded: summary.unrecorded })}
            </div>
          </div>
          <button type="button" aria-label={t('nextMonth')} disabled={atCurrentMonth} onClick={() => go(shiftMonth(month, 1))}>
            ›
          </button>
        </div>
      </div>

      <div className="att-summary">
        {ORDER.map((key) => (
          <div key={key} className="att-tile">
            <div className="att-tile-head">
              <span className={`att-dot att-swatch-${STATUS[key].tone}`} />
              <span>{ts(key)}</span>
            </div>
            <div className="att-tile-count">{summary.counts[key]}</div>
          </div>
        ))}
        <div className="att-tile">
          <div className="att-tile-head">
            <span className="att-dot att-swatch-hours" />
            <span>{t('hoursWorked')}</span>
          </div>
          <div className="att-tile-count">{summary.worked > 0 ? hhmm(summary.worked) : '—'}</div>
        </div>
      </div>

      <div className="am-cal-card">
        <div className="am-grid am-dow-row" aria-hidden="true">
          {dow.map((d) => (
            <div key={d} className="am-dow-head">
              {d}
            </div>
          ))}
        </div>

        <div className="am-grid">
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} className="am-cell am-c-blank" />
          ))}
          {rows.map((row) => {
            const day = Number(row.onDate.slice(8));
            const label = t('cellAria', {
              day,
              month: monthLabel(month, locale),
              status: row.status ? ts(row.status as StatusKey) : row.rostered ? t('notRecordedLower') : t('notRosteredLower'),
            });
            return (
              <button
                key={row.onDate}
                type="button"
                className={`am-cell ${cellTone(row)} ${selected === row.onDate ? 'is-selected' : ''}`}
                aria-label={label}
                aria-pressed={selected === row.onDate}
                onClick={() => setSelected(selected === row.onDate ? null : row.onDate)}
              >
                <span className="am-cell-day">{day}</span>
                {/* A letter as well as the colour. Roughly one man in twelve
                    cannot reliably tell the green from the red, and a screen
                    that says "the green ones" to everybody else is telling them
                    nothing. */}
                <span className="am-cell-mark">{row.status ? tss(row.status as StatusKey) : row.rostered ? '·' : ''}</span>
              </button>
            );
          })}
        </div>

        <div className="am-legend">
          {ORDER.map((key) => (
            <span key={key} className="am-legend-item">
              <span className={`am-swatch am-c-${STATUS[key].tone}`} />
              {ts(key)}
            </span>
          ))}
          <span className="am-legend-item">
            <span className="am-swatch am-c-unmarked" />
            {t('notRecorded')}
          </span>
          <span className="am-legend-item">
            <span className="am-swatch am-c-off" />
            {t('dayOff')}
          </span>
        </div>
      </div>

      {/* Tapping a day opens it rather than navigating: the times and the note
          are the detail behind a colour, and losing the month to read one day
          would make comparing two days a round trip each way. */}
      {chosen && (
        <div className="card am-detail">
          <div className="am-detail-head">
            <strong>
              {new Date(`${chosen.onDate}T12:00:00`).toLocaleDateString(intlLocale(locale), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </strong>
            <button type="button" className="btn-ghost" onClick={() => setSelected(null)}>
              {t('close')}
            </button>
          </div>
          <div className="am-detail-body">
            <span className={`att-chip att-chip-${chosen.status ? STATUS[chosen.status as StatusKey].tone : 'off'}`}>
              {chosen.status ? ts(chosen.status as StatusKey) : chosen.rostered ? t('notRecorded') : t('notRostered')}
            </span>
            {chosen.inAt && (
              <span className="att-clock">
                {toLocalTime(chosen.inAt, register.timezone)}
                {' → '}
                {chosen.outAt ? toLocalTime(chosen.outAt, register.timezone) : t('stillIn')}
              </span>
            )}
            {chosenMins !== null && <span className="am-hours">{hhmm(chosenMins)}</span>}
            {chosen.shiftStart && <span className="am-detail-shift">{t('shiftFrom', { time: chosen.shiftStart })}</span>}
          </div>
          {chosen.note && <p className="am-note">{chosen.note}</p>}
          {chosen.markedByName && (
            <p className="att-meta">
              {chosen.markedAt
                ? t('markedByAt', {
                    name: chosen.markedByName,
                    when: new Intl.DateTimeFormat(intlLocale(locale), {
                      timeZone: register.timezone,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(chosen.markedAt)),
                  })
                : t('markedBy', { name: chosen.markedByName })}
            </p>
          )}
        </div>
      )}

      <div className="att-foot">
        <span>
          {readOnly ? t('footOwn') : t('footOther')}
        </span>
        <span>{t('tzFoot', { tz: register.timezone.replace('_', ' ') })}</span>
      </div>
    </div>
  );
}
