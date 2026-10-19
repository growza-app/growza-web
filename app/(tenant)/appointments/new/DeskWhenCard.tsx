'use client';

import { useRef } from 'react';
import { useDialog } from '../../../shared/a11y/useDialog';

export type WhenValue = 'queue' | 'now' | 'pick';

export interface WhenChoice {
  value: WhenValue;
  label: string;
  on: boolean;
  /** Offered but not possible right now (nobody on the branch): drawn, not pressable. */
  off?: boolean;
}

/**
 * Owner, 2026-10-19 — the first question of New booking on a laptop: when. An overlay over the booking screen, not a
 * column in it.
 *
 * Starts now and Waiting answer it in one press and the card closes. Pick a time opens the day and the time asked
 * for, and Continue closes it. The exact free time is chosen on the screen behind, once the services are on the
 * visit, because the free times depend on how long the services take. Nothing here owns state: the booking form
 * does, so this card only asks and the form keeps the answer.
 */
export function DeskWhenCard({
  title,
  choices,
  onChoose,
  picking,
  days,
  day,
  onDay,
  timeValue,
  timeOptions,
  onTime,
  labels,
  busy,
  onContinue,
  onClose,
}: {
  title: string;
  choices: WhenChoice[];
  onChoose: (value: WhenValue) => void;
  /** Pick a time is the answer: the day and the time are asked. */
  picking: boolean;
  /** Today first, then tomorrow — the two the card offers as buttons. Anything later is the date box. */
  days: { iso: string; label: string }[];
  day: string;
  onDay: (iso: string) => void;
  timeValue: string;
  timeOptions: { value: string; label: string }[];
  onTime: (value: string) => void;
  labels: { today: string; tomorrow: string; otherDay: string; bookingTime: string; anyTime: string; cont: string; close: string };
  busy: boolean;
  onContinue: () => void;
  /** Leaves the booking altogether. */
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, { onClose });
  const today = days[0]?.iso ?? day;
  const tomorrow = days[1]?.iso ?? day;
  const other = day !== today && day !== tomorrow;

  return (
    <div className="modal-backdrop">
      <div className="modal wi-when-card" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <h2 className="wi-when-card-title">{title}</h2>
        <div className="wi-when-list" role="radiogroup" aria-label={title}>
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={c.on}
              className={`wi-when-opt ${c.on ? 'wi-when-opt-on' : ''}`}
              onClick={() => onChoose(c.value)}
              disabled={busy || c.off}
            >
              {c.label}
            </button>
          ))}
        </div>

        {picking ? (
          <>
            <div className="wi-when-days" role="group" aria-label={labels.today}>
              <button type="button" className={`wi-chip ${day === today ? 'wi-chip-on' : ''}`} aria-pressed={day === today} onClick={() => onDay(today)} disabled={busy}>
                {labels.today}
              </button>
              <button type="button" className={`wi-chip ${day === tomorrow ? 'wi-chip-on' : ''}`} aria-pressed={day === tomorrow} onClick={() => onDay(tomorrow)} disabled={busy}>
                {labels.tomorrow}
              </button>
              <input
                type="date"
                className={`wi-when-other ${other ? 'wi-when-other-on' : ''}`}
                aria-label={labels.otherDay}
                min={today}
                value={other ? day : ''}
                onChange={(e) => e.target.value && onDay(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="field wi-when-time">
              <label htmlFor="wi-when-time">{labels.bookingTime}</label>
              <select id="wi-when-time" value={timeValue} onChange={(e) => onTime(e.target.value)} disabled={busy}>
                <option value="">{labels.anyTime}</option>
                {timeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn wi-when-go" onClick={onContinue} disabled={busy}>
              {labels.cont}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
