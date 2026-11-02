'use client';

import type { ChangedEnd } from '../lib/report-dates';

/**
 * Owner, 2026-11-02 — the period a report covers, asked for as two dates.
 *
 * It replaces a list of five fixed periods. The five were one tap each but could not answer "the 3rd to the
 * 17th", which is the question an owner asks when they are checking a month against a bill or a festival
 * week against the one before it.
 *
 * The classes are the Sales filter's (`.sls-date-*`), not a second set: that screen already asks for a span
 * with two dates and an owner has met the control there, down to which end gives way when one crosses the
 * other. Shared by the diary report and the counter report, which are each other's mirror; the words come in
 * as props so each keeps its own message group and next-intl's types stay honest.
 */
export function ReportDates({
  from,
  to,
  today,
  labels,
  onChange,
}: {
  from: string;
  to: string;
  /** Today where the business is — neither field offers a day after it. */
  today: string;
  labels: { group: string; from: string; to: string };
  onChange: (fromISO: string, toISO: string, changed: ChangedEnd) => void;
}) {
  return (
    <div className="sls-dates cr-dates" role="group" aria-label={labels.group}>
      <label className="sls-date-field">
        <span className="sls-date-label">{labels.from}</span>
        <input
          type="date"
          className="sls-date-input"
          value={from}
          max={today}
          onChange={(e) => onChange(e.target.value, to, 'from')}
        />
      </label>
      <label className="sls-date-field">
        <span className="sls-date-label">{labels.to}</span>
        <input
          type="date"
          className="sls-date-input"
          value={to}
          max={today}
          onChange={(e) => onChange(from, e.target.value, 'to')}
        />
      </label>
    </div>
  );
}
