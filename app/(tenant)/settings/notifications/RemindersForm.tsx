'use client';

import { useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';

const SAVE_ERROR = 'Could not save — check the server is running.';

interface ReminderRow {
  key: string;
  template: string;
  label: string;
  enabled: boolean;
  hours: number;
}

const REMINDER_DEFS = [
  { key: 'reminder_-24h', template: 'reminder_24h', label: 'First reminder', defaultHours: 24 },
  { key: 'reminder_-2h', template: 'reminder_2h', label: 'Second reminder', defaultHours: 2 },
];

export function RemindersForm({ initial }: { initial: SettingsSummary }) {
  const [rows, setRows] = useState<ReminderRow[]>(() =>
    REMINDER_DEFS.map((def) => {
      const existing = initial.reminderRules.find((r) => r.ruleKey === def.key);
      return {
        key: def.key,
        template: def.template,
        label: def.label,
        enabled: !!existing,
        hours: existing ? Math.round(Math.abs(existing.offsetMin) / 60) : def.defaultHours,
      };
    }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateRow = (i: number, patch: Partial<ReminderRow>) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const reminderRules = rows
        .filter((r) => r.enabled)
        .map((r) => ({ ruleKey: r.key, offsetMin: -(r.hours * 60), template: r.template }));
      await api.updateReminders(reminderRules);
      setSaved(true);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">Notifications</div>
      <div className="card-body">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          Send an automatic WhatsApp reminder before a booking.
        </p>
        {rows.map((row, i) => (
          <div
            key={row.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 0',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}
          >
            <label className="switch">
              <input type="checkbox" checked={row.enabled} onChange={() => updateRow(i, { enabled: !row.enabled })} />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </label>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 620, fontSize: 14.5 }}>{row.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="number"
                  min={1}
                  style={{ width: 70, minWidth: 70 }}
                  value={row.hours}
                  disabled={!row.enabled}
                  onChange={(e) => updateRow(i, { hours: Number(e.target.value) })}
                />
                <span className="field-hint" style={{ margin: 0 }}>
                  hours before the booking
                </span>
              </div>
            </div>
          </div>
        ))}
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
