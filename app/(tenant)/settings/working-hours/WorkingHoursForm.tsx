'use client';

import { useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';
import { toWeekdayRows, WeekdayHoursEditor } from '../../components/WeekdayHoursEditor';

const SAVE_ERROR = 'Could not save — check the server is running.';

export function WorkingHoursForm({ initial }: { initial: SettingsSummary }) {
  const [rows, setRows] = useState(() => toWeekdayRows(initial.workingHours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      await api.updateOrgWorkingHours(open.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })));
      setSaved(true);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">Working hours</div>
      <div className="card-body">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          Your business&apos;s default open hours. Staff can follow these automatically from their own profile, or set their own instead.
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
  );
}
