'use client';

import { useState } from 'react';
import { IconBan, IconClock } from './icons';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Index IS the weekday, so the strip's positions and the data agree by construction. */
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface WeekdayRow {
  weekday: number;
  open: boolean;
  startTime: string;
  endTime: string;
}

/**
 * Shared between the org-level Settings → Working hours form, each staff
 * member's own editor, and the add-staff wizard's step 2 — all three edit the
 * exact same "one range per weekday" shape.
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

/**
 * Jira GRW-201 — board 5c: the days that share a time read as one line.
 *
 * ## What it replaces
 *
 * Seven rows, one per weekday, each with a switch, a day name and two time
 * inputs. A salon open 9–7 Monday to Saturday and closed Sunday read as six
 * near-identical lines and one different one — and the one that differs is the
 * only line carrying information.
 *
 * Now that same week is two rows.
 *
 * ## Grouped by VALUE, not by adjacency
 *
 * "Days that share a time" is what the board asks for, and it is the right rule
 * rather than the easy one. Monday 9–7, Tuesday closed, Wednesday 9–7 groups as
 * {Mon, Wed} and {Tue} — two rows. Requiring calendar adjacency would give
 * three, and would split a pair that genuinely is one answer.
 *
 * ## The week strip, rather than a list of initials
 *
 * The board says day initials, not words, and initials alone are ambiguous: T
 * is Tuesday and Thursday, S is Saturday and Sunday. A lone "S" on a row cannot
 * be read at all.
 *
 * So every row shows all seven positions and fills the ones it covers. The day
 * is identified by WHERE it sits, not by which letter it is — which is the more
 * reliable channel for the low-literacy use this design is explicitly for, and
 * it makes "Monday to Saturday" a shape you recognise rather than a sentence
 * you parse. The words are still there for a screen reader.
 *
 * ## Colour is never the only signal
 *
 * A working row has a clock, its times, and the accent colour. A day off has a
 * crossed circle, the word "Closed", and muted colour. Removing the colour from
 * either leaves it fully readable, which is the rule the board states and the
 * one that survives a cheap screen in a bright salon.
 *
 * ## It calls `onChange` once per weekday
 *
 * Editing a collapsed row of six days fires six patches. Every consumer's
 * updater is `setRows(prev => prev.map(...))` — functional, so the six batch
 * correctly. A consumer that closed over `rows` instead would apply only the
 * last one and silently lose five days, so this is a real coupling and is
 * stated rather than assumed.
 *
 * The props are deliberately unchanged from the seven-row version, so all three
 * screens get this without touching any of them.
 */
export function WeekdayHoursEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: WeekdayRow[];
  onChange: (weekday: number, patch: Partial<WeekdayRow>) => void;
  disabled?: boolean;
}) {
  /*
   * Which days the owner asked to see on their own.
   *
   * View state, never data: splitting a group changes nothing about the week,
   * it just stops drawing those days as one line so one of them can be made to
   * differ. Kept here rather than lifted, because no consumer has any use for
   * it and three of them would have to carry it.
   */
  const [split, setSplit] = useState<ReadonlySet<number>>(() => new Set());

  const groups = groupByValue(rows, split);

  const patchGroup = (days: readonly number[], patch: Partial<WeekdayRow>) => {
    for (const weekday of days) onChange(weekday, patch);
  };

  return (
    <>
      {groups.map((g) => {
        const first = g.rows[0]!;
        const days = g.rows.map((r) => r.weekday);
        return (
          <div
            className={`wk-row ${first.open ? 'wk-row-open' : 'wk-row-off'} ${disabled ? 'wk-row-disabled' : ''}`}
            key={days.join('-')}
          >
            <label className="switch wk-switch">
              <input
                type="checkbox"
                checked={first.open}
                disabled={disabled}
                aria-label={`${labelFor(days)} open`}
                onChange={() => patchGroup(days, { open: !first.open })}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </label>

            {/* The strip is decorative once the label below it says the same
                thing in words — announcing fourteen letters would be worse than
                announcing none. */}
            <div className="wk-days">
              <span className="wk-days-strip" aria-hidden="true">
                {WEEKDAY_INITIALS.map((letter, weekday) => (
                  <span
                    key={weekday}
                    className={`wk-day ${days.includes(weekday) ? 'is-on' : ''}`}
                  >
                    {letter}
                  </span>
                ))}
              </span>
              <span className="wk-days-label">{labelFor(days)}</span>
            </div>

            {first.open ? (
              <div className="wk-times">
                <span className="wk-glyph" aria-hidden="true">
                  <IconClock />
                </span>
                <input
                  type="time"
                  disabled={disabled}
                  value={first.startTime}
                  aria-label={`${labelFor(days)} start time`}
                  onChange={(e) => patchGroup(days, { startTime: e.target.value })}
                />
                <span className="wk-dash" aria-hidden="true">
                  –
                </span>
                <input
                  type="time"
                  disabled={disabled}
                  value={first.endTime}
                  aria-label={`${labelFor(days)} end time`}
                  onChange={(e) => patchGroup(days, { endTime: e.target.value })}
                />
              </div>
            ) : (
              <div className="wk-times wk-closed">
                <span className="wk-glyph" aria-hidden="true">
                  <IconBan />
                </span>
                <span>Closed</span>
              </div>
            )}

            {/* Only worth offering on a row that covers more than one day —
                a single day is already as split as it goes. */}
            {days.length > 1 && !disabled && (
              <button
                type="button"
                className="wk-split"
                onClick={() => setSplit((prev) => new Set([...prev, ...days]))}
              >
                Set one day differently
              </button>
            )}
          </div>
        );
      })}

      {split.size > 0 && !disabled && (
        <button type="button" className="link-btn wk-regroup" onClick={() => setSplit(new Set())}>
          Group matching days again
        </button>
      )}
    </>
  );
}

/**
 * "Monday to Saturday", "Monday, Wednesday", "Sunday".
 *
 * A RUN becomes "to", anything else is a list. A six-day week is the commonest
 * case in this product and "Monday, Tuesday, Wednesday, Thursday, Friday,
 * Saturday" is a sentence nobody reads to the end of.
 */
function labelFor(days: readonly number[]): string {
  if (days.length === 1) return WEEKDAY_FULL[days[0]!]!;
  const isRun = days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
  if (isRun) return `${WEEKDAY_FULL[days[0]!]} to ${WEEKDAY_FULL[days[days.length - 1]!]}`;
  return days.map((d) => WEEKDAY_NAMES[d]).join(', ');
}

/**
 * Days that share an answer, in weekday order, with anything the owner has
 * split out standing on its own.
 *
 * A closed day's times are deliberately NOT part of its key: a day off carries
 * whatever start and end it happened to have before it was switched off, and
 * two closed days that differ only in invisible values are one answer, not two.
 * Without this, switching Sunday off would leave it as its own row beside an
 * already-closed Saturday for no reason a reader could see.
 */
function groupByValue(
  rows: readonly WeekdayRow[],
  split: ReadonlySet<number>,
): { rows: WeekdayRow[] }[] {
  const byKey = new Map<string, WeekdayRow[]>();
  const ordered = [...rows].sort((a, b) => a.weekday - b.weekday);

  for (const row of ordered) {
    const key = split.has(row.weekday)
      ? `solo:${row.weekday}`
      : row.open
        ? `open:${row.startTime}-${row.endTime}`
        : 'closed';
    const existing = byKey.get(key);
    if (existing) existing.push(row);
    else byKey.set(key, [row]);
  }

  /*
   * Ordered by each group's FIRST day, so the week still reads top to bottom.
   * `Map` preserves insertion order and the input was sorted, so this holds
   * without a second sort — but it is asserted by a test rather than left to
   * that being remembered.
   */
  return [...byKey.values()].map((groupRows) => ({ rows: groupRows }));
}
