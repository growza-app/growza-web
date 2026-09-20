'use client';

import { useState } from 'react';
import { formatTime } from '../lib/api';
import { formatDuration } from '../lib/appointment-display';
import type { StaffRow } from '../lib/staff-summary';
import { StaffVisitsSheet, type StaffVisitsLabels } from './StaffVisitsSheet';

/**
 * Jira GRW-343 — the phone's staff filter, as a table: each person's day at a glance, and a tap to see just theirs.
 *
 * It replaces a row of name chips that only filtered. A real `<table>` so a screen reader gets the columns; each row is
 * one toggle (the name is the button, and the row answers the tap, so the whole 44px line is the target). Tapping the
 * picked row again goes back to everyone. The number of bookings is its own button: it opens a sheet from the bottom
 * listing that person's visits — the time, who it is for, and the service — so "who is Arjun with at 3?" needs no trip
 * down to the schedule. Phone only — a laptop keeps its Staff dropdown (see 93-staff-table.css).
 */
export interface StaffTableLabels {
  caption: string;
  staff: string;
  bookings: string;
  booked: string;
  next: string;
  first: string;
  everyone: string;
  /** Shown in the sheet for a person with nothing on. */
  nothing: string;
  /** The sheet's close button, and "3 bookings" under its title. */
  close: string;
  count: (n: number) => string;
}

export function StaffTable({
  everyone,
  staff,
  active,
  onPick,
  timezone,
  upcoming,
  labels,
}: {
  everyone: StaffRow;
  staff: readonly StaffRow[];
  /** The picked person's name, or `'Everyone'`. */
  active: string;
  onPick: (name: string) => void;
  timezone: string;
  /** Today: the last column is what is NEXT. Any other day it is the FIRST. */
  upcoming: boolean;
  labels: StaffTableLabels;
}) {
  // Whose bookings the sheet is showing: a person's name, 'Everyone', or nobody (closed).
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  if (staff.length === 0) return null;

  const rows: Array<{ key: string; pick: string; label: string; row: StaffRow; total: boolean }> = [
    { key: 'everyone', pick: 'Everyone', label: labels.everyone, row: everyone, total: true },
    ...staff.map((s) => ({ key: s.name, pick: s.name, label: s.name, row: s, total: false })),
  ];

  return (
    <div className="bk-staff-table-wrap">
      <table className="bk-staff-table">
        <caption className="sr-only">{labels.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{labels.staff}</th>
            <th scope="col">{labels.bookings}</th>
            <th scope="col">{labels.booked}</th>
            <th scope="col">{upcoming ? labels.next : labels.first}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, pick, label, row, total }) => {
            const on = active === pick;
            return (
              <tr
                key={key}
                className={`${on ? 'is-active' : ''} ${total ? 'is-total' : ''} ${row.bookings === 0 ? 'is-idle' : ''}`}
                // The tap lands on the row; the button inside is what a keyboard reaches, and its click bubbles here.
                onClick={() => onPick(on && !total ? 'Everyone' : pick)}
              >
                <th scope="row">
                  <button type="button" aria-pressed={on}>
                    {label}
                  </button>
                </th>
                <td>
                  {row.bookings > 0 ? (
                    <button
                      type="button"
                      className="bk-count-btn"
                      aria-haspopup="dialog"
                      aria-label={`${label}: ${labels.count(row.bookings)}`}
                      onClick={(e) => {
                        e.stopPropagation(); // opens the sheet; it must not also pick the row
                        setSheetFor(pick);
                      }}
                    >
                      <span className="bk-count-chip">{row.bookings}</span>
                    </button>
                  ) : (
                    <span className="bk-count-none">{row.bookings}</span>
                  )}
                </td>
                <td>{row.bookedMin > 0 ? formatDuration(row.bookedMin) : '—'}</td>
                <td>{row.nextAt ? formatTime(row.nextAt, timezone) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sheetFor !== null ? (
        <StaffVisitsSheet
          title={sheetFor === 'Everyone' ? labels.everyone : sheetFor}
          visits={(rows.find((r) => r.pick === sheetFor)?.row.visits) ?? []}
          timezone={timezone}
          showStaff={sheetFor === 'Everyone'}
          labels={{ count: labels.count, nothing: labels.nothing, close: labels.close } satisfies StaffVisitsLabels}
          onClose={() => setSheetFor(null)}
        />
      ) : null}
    </div>
  );
}
