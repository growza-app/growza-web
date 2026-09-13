'use client';

import { useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';
import { copy } from '../../lib/copy';
import { BranchScopeNote } from '../BranchScopeNote';

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

export function RemindersForm({
  initial,
  whatsappLive,
  branchName = null,
}: {
  initial: SettingsSummary;
  /** Jira GRW-230 — set when a branch is picked: these are that branch's reminders. */
  branchName?: string | null;
  /**
   * Jira GRW-158 · GRW-165 — whether anything on this screen actually sends.
   *
   * Until WhatsApp is switched on for this business, nothing does. The rules
   * are still stored and still expand into `scheduled_message` rows on every
   * booking; there is simply no sender yet. An owner who sets these up and is
   * not told that is an owner who believes their no-shows are about to drop.
   */
  whatsappLive?: boolean;
}) {
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
      await api.updateReminders(reminderRules, initial.scope.locationId);
      setSaved(true);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <BranchScopeNote settings={initial} branchName={branchName} keys={['reminder_rules']} what="reminders" />
    <div className="card">
      <div className="card-head">{initial.scope.locationId ? `${branchName ?? 'Branch'} reminders` : 'Notifications'}</div>
      <div className="card-body">
        {whatsappLive ? (
          <p className="field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
            Send an automatic WhatsApp reminder before a booking.
          </p>
        ) : (
          /* Above the switches, not below them — an owner who has already
             toggled a reminder and pressed Save has been misled, and a note
             underneath arrives too late to stop that. */
          <div className="banner banner-info" style={{ marginTop: 0, marginBottom: 16 }}>
            <strong>{copy.whatsapp.remindersNotLiveTitle}</strong>
            <div style={{ marginTop: 4 }}>{copy.whatsapp.remindersNotLive}</div>
          </div>
        )}
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
              {/* "Saved" alone would read as "done, it's working now". It is
                  saved; it is not sending. Say both. */}
              {whatsappLive ? 'Saved' : 'Saved — these start sending when WhatsApp goes live'}
            </span>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
