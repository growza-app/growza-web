'use client';

import { useTranslations } from 'next-intl';
import { SettingsSaveBar } from '../SettingsSaveBar';
import { useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';
import { toWeekdayRows, WeekdayHoursEditor } from '../../components/WeekdayHoursEditor';
import { useCloseAfterSave } from '../../lib/close-after-save';

export function WorkingHoursForm({ initial, branchName = null }: { initial: SettingsSummary; branchName?: string | null }) {
  const t = useTranslations('settingsHours');
  // Jira GRW-556 (follow-up) — Save finishes the task: back to the list, which says "Saved".
  const closeForm = useCloseAfterSave('/settings');
  // Jira GRW-230 — null: the business's hours; a branch id: that branch's own.
  const branchId = initial.scope.locationId;
  // Jira GRW-396 — after a save the note above the form ("uses the business's hours" / "has its own") is redrawn.
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
    // Jira GRW-474 — an emptied box is `Number('')`, which is 0 and passed; it saved "no grace at all" for a field
    // the owner had only cleared. Empty is refused like any other value out of range.
    if (grace.trim() === '' || !Number.isInteger(graceNum) || graceNum < 0 || graceNum > 120) {
      setGraceError(t('errors.graceRange'));
      return;
    }
    setBusy(true);
    setGraceError(null);
    setGraceSaved(false);
    try {
      await api.updateBookingRules({ attendanceLateGraceMin: graceNum }, branchId);
      setGraceSaved(true);
      closeForm();
    } catch {
      setGraceError(t('errors.saveFailed'));
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
      setError(t('errors.startBeforeEnd'));
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
      closeForm();
    } catch {
      setError(t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <div className="card">
      <div className="card-head">{branchId ? (branchName ? t('branchTitleNamed', { name: branchName }) : t('branchTitleUnnamed')) : t('title')}</div>
      <div className="card-body">
        <p className="field-hint settings-card-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {branchId ? (branchName ? t('hintBranchNamed', { name: branchName }) : t('hintBranchUnnamed')) : t('hintBusiness')}
        </p>
        <WeekdayHoursEditor rows={rows} onChange={update} />
        {error && <div role="alert" className="field-error">{error}</div>}
        {/*
          Two forms on this screen, two saves, and until now both said "Save changes" (design review,
          2026-10-07). Change the hours AND the grace period, press one, and the other was gone with nothing
          said. Each button names what it keeps, and neither sticks to the phone's bottom edge: two bars on
          one edge would cover each other.
        */}
        <SettingsSaveBar
          pinned={false}
          busy={busy}
          saved={saved}
          onSave={save}
          saveLabel={t('saveHours')}
          savingLabel={t('saving')}
          savedLabel={t('saved')}
        />
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
      <div className="card-head">{t('attendance')}</div>
      <div className="card-body">
        <p className="field-hint settings-card-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {t('attendanceHint')}
        </p>
        <label className="field-label" htmlFor="late-grace">
          {t('graceLabel')}
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
          <span className="field-hint" style={{ margin: 0 }}>{t('minutes')}</span>
        </div>
        {/* Spelled out, because "5 minutes" alone leaves the reader to guess
            whether the boundary minute itself counts. */}
        <p className="field-hint" style={{ marginTop: 8 }}>
          {t('lateFrom', { time: graceLabel })}
        </p>
        {graceError && <div role="alert" className="field-error">{graceError}</div>}
        <SettingsSaveBar
          pinned={false}
          busy={busy}
          saved={graceSaved}
          onSave={saveGrace}
          saveLabel={t('saveAttendance')}
          savingLabel={t('saving')}
          savedLabel={t('saved')}
        />
      </div>
    </div>
    </>
  );
}
