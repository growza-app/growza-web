'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';
import { toWeekdayRows, WeekdayHoursEditor } from '../../components/WeekdayHoursEditor';

export function WorkingHoursForm({ initial, branchName = null }: { initial: SettingsSummary; branchName?: string | null }) {
  const t = useTranslations('settingsHours');
  // Jira GRW-230 — null: the business's hours; a branch id: that branch's own.
  const branchId = initial.scope.locationId;
  // Jira GRW-396 — after a save the note above the form ("uses the business's hours" / "has its own") is redrawn.
  const router = useRouter();
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
      setGraceError(t('errors.graceRange'));
      return;
    }
    setBusy(true);
    setGraceError(null);
    setGraceSaved(false);
    try {
      await api.updateBookingRules({ attendanceLateGraceMin: graceNum }, branchId);
      setGraceSaved(true);
      router.refresh();
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
      router.refresh();
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
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn" disabled={busy} onClick={save}>
            {busy ? t('saving') : t('save')}
          </button>
          {saved && !busy && (
            <span className="field-hint" style={{ margin: 0, color: 'var(--accent-deep)' }}>
              {t('saved')}
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
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn" disabled={busy} onClick={saveGrace}>
            {busy ? t('saving') : t('save')}
          </button>
          {graceSaved && !busy && (
            <span className="field-hint" style={{ margin: 0, color: 'var(--accent-deep)' }}>
              {t('saved')}
            </span>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
