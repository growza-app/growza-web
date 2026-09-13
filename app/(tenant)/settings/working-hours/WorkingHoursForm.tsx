'use client';

import { useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';
import { toWeekdayRows, WeekdayHoursEditor } from '../../components/WeekdayHoursEditor';
import { BranchScopeNote } from '../BranchScopeNote';

const SAVE_ERROR = 'Could not save — check the server is running.';

export function WorkingHoursForm({ initial, branchName = null }: { initial: SettingsSummary; branchName?: string | null }) {
  // Jira GRW-230 — null: the business's hours; a branch id: that branch's own.
  const branchId = initial.scope.locationId;
  const [rows, setRows] = useState(() => toWeekdayRows(initial.workingHours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [grace, setGrace] = useState(String(initial.booking.attendanceLateGraceMin));
  const [graceError, setGraceError] = useState<string | null>(null);
  const [graceSaved, setGraceSaved] = useState(false);

  const graceNum = Number(grace);
  /** The first minute that IS late, in the example's own clock. */
  const graceLabel = (() => {
    const total = 10 * 60 + graceNum + 1;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  })();

  const saveGrace = async () => {
    if (!Number.isInteger(graceNum) || graceNum < 0 || graceNum > 120) {
      setGraceError('Enter a whole number of minutes between 0 and 120');
      return;
    }
    setBusy(true);
    setGraceError(null);
    setGraceSaved(false);
    try {
      await api.updateBookingRules({ attendanceLateGraceMin: graceNum }, branchId);
      setGraceSaved(true);
    } catch {
      setGraceError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const update = (weekday: number, patch: Partial<ReturnType<typeof toWeekdayRows>[number]>) => {
    setRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    const open = rows.filter((r) => r.open);
    if (open.some((r) => r.startTime >= r.endTime)) {
      setError('Start time must be before end time');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateOrgWorkingHours(
        open.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
        branchId,
      );
      setSaved(true);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <BranchScopeNote settings={initial} branchName={branchName} keys={['working_hours', 'attendance_late_grace_min']} what="hours" />
    <div className="card">
      <div className="card-head">{branchId ? `${branchName ?? 'Branch'} hours` : 'Working hours'}</div>
      <div className="card-body">
        <p className="field-hint settings-card-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {branchId
            ? `When ${branchName ?? 'this branch'} is open. Staff at ${branchName ?? 'this branch'} who follow the salon's hours follow these.`
            : "Your business's default open hours. Staff can follow these automatically from their own profile, or set their own instead."}
        </p>
        <WeekdayHoursEditor rows={rows} onChange={update} />
        {error && <div className="field-error">{error}</div>}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {saved && !busy && (
            <span className="field-hint" style={{ margin: 0, color: 'var(--accent-deep)' }}>
              Saved
            </span>
          )}
        </div>
      </div>
    </div>

    {/*
      Jira GRW-63 · GRW-170 — the attendance grace period.

      It lives on THIS screen rather than under Booking because it is measured
      from the hours directly above it: an owner setting a 10:00 open time sees,
      in the same breath, when somebody arriving counts as late. The field is
      saved through the booking-rules route, which is where the other policy
      numbers already go — `staffSeesClientContact` set that precedent.
    */}
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">Attendance</div>
      <div className="card-body">
        <p className="field-hint settings-card-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          Lateness is measured against each person&apos;s own shift start, not one time for
          the whole business. This is how long after it somebody can arrive before the
          register marks them late.
        </p>
        <label className="field-label" htmlFor="late-grace">
          Allow arriving late by
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <input
            id="late-grace"
            type="number"
            min={0}
            max={120}
            step={1}
            value={grace}
            disabled={busy}
            style={{ width: 110 }}
            onChange={(e) => {
              setGrace(e.target.value);
              setGraceError(null);
              setGraceSaved(false);
            }}
          />
          <span className="field-hint" style={{ margin: 0 }}>minutes</span>
        </div>
        {/* Spelled out, because "5 minutes" alone leaves the reader to guess
            whether the boundary minute itself counts. */}
        <p className="field-hint" style={{ marginTop: 8 }}>
          {graceNum === 0
            ? 'Someone on a 10:00 shift is late from 10:01.'
            : `Someone on a 10:00 shift is late from ${graceLabel}.`}
        </p>
        {graceError && <div className="field-error">{graceError}</div>}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn" disabled={busy} onClick={saveGrace}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {graceSaved && !busy && (
            <span className="field-hint" style={{ margin: 0, color: 'var(--accent-deep)' }}>
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
