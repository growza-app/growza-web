'use client';

import { useTranslations } from 'next-intl';
import { SettingsSaveBar } from '../SettingsSaveBar';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, type SettingsSummary } from '../../lib/api';
import { useCloseAfterSave } from '../../lib/close-after-save';

interface ReminderRow {
  key: string;
  template: string;
  /** Names the reminder in `settingsReminders` — `first` / `second`, or `other` for one this screen did not create. */
  nameKey: 'first' | 'second' | 'other';
  enabled: boolean;
  hours: number;
}

const REMINDER_DEFS = [
  { key: 'reminder_-24h', template: 'reminder_24h', nameKey: 'first', defaultHours: 24 },
  { key: 'reminder_-2h', template: 'reminder_2h', nameKey: 'second', defaultHours: 2 },
] as const;

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
  const t = useTranslations('settingsReminders');
  // Jira GRW-556 (follow-up) — Save finishes the task: back to the list, which says "Saved".
  const closeForm = useCloseAfterSave('/settings');
  const router = useRouter();
  /*
   * Jira GRW-474 — every saved rule is a row, not only the two this screen knows. It was built from two hard-coded
   * keys, so a business on another vertical's defaults (a clinic's 48-hour reminder) saw it as "off", and pressing
   * Save deleted it. The two known reminders come first; anything else stored keeps its own key and message.
   */
  const [rows, setRows] = useState<ReminderRow[]>(() => [
    ...REMINDER_DEFS.map((def) => {
      const existing = initial.reminderRules.find((r) => r.ruleKey === def.key);
      return {
        key: def.key,
        template: def.template,
        nameKey: def.nameKey,
        enabled: !!existing,
        hours: existing ? Math.round(Math.abs(existing.offsetMin) / 60) : def.defaultHours,
      };
    }),
    ...initial.reminderRules
      .filter((r) => !REMINDER_DEFS.some((def) => def.key === r.ruleKey))
      .map((r) => ({
        key: r.ruleKey,
        template: r.template,
        nameKey: 'other' as const,
        enabled: true,
        hours: Math.round(Math.abs(r.offsetMin) / 60),
      })),
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateRow = (i: number, patch: Partial<ReminderRow>) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    // Jira GRW-474 — an emptied box was `Number('')`, 0: a reminder at the moment of the visit. A whole number of
    // hours, 1 to 168 (a week), or the save does not go.
    if (rows.some((r) => r.enabled && (!Number.isInteger(r.hours) || r.hours < 1 || r.hours > 168))) {
      setError(t('errors.hoursRange'));
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const reminderRules = rows
        .filter((r) => r.enabled)
        .map((r) => ({ ruleKey: r.key, offsetMin: -(r.hours * 60), template: r.template }));
      await api.updateReminders(reminderRules, initial.scope.locationId);
      setSaved(true);
      // Closes like every Settings form — unless WhatsApp is not live, when the saved message is also the news that
      // nothing will be sent yet (`savedNotLive`), which the owner must read here.
      if (whatsappLive) closeForm();
      // Jira GRW-396 — the note above the form says whether this branch now has its own reminders.
      else router.refresh();
    } catch (err) {
      // The server's reason — "your plan allows 1 reminder", "two reminders cannot go out at the same time".
      setError(err instanceof ApiError && err.status < 500 ? err.message : t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <div className="card">
      <div className="card-head">{initial.scope.locationId ? (branchName ? t('branchTitleNamed', { name: branchName }) : t('branchTitleUnnamed')) : t('title')}</div>
      <div className="card-body">
        {whatsappLive ? (
          <p className="field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
            {t('liveHint')}
          </p>
        ) : (
          /* Above the switches, not below them — an owner who has already
             toggled a reminder and pressed Save has been misled, and a note
             underneath arrives too late to stop that. */
          <div className="banner banner-info" style={{ marginTop: 0, marginBottom: 16 }}>
            <strong>{t('notLiveTitle')}</strong>
            <div style={{ marginTop: 4 }}>{t('notLive')}</div>
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
              <input type="checkbox" aria-label={t(row.nameKey)} checked={row.enabled} onChange={() => updateRow(i, { enabled: !row.enabled })} />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </label>
            <div style={{ flex: 1 }}>
              <div id={`rem-title-${row.key}`} style={{ fontWeight: 620, fontSize: 14.5 }}>{t(row.nameKey)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="number"
                  min={1}
                  max={168}
                  step={1}
                  aria-labelledby={`rem-title-${row.key} rem-hint-${row.key}`}
                  style={{ width: 70, minWidth: 70 }}
                  value={row.hours}
                  disabled={!row.enabled}
                  onChange={(e) => updateRow(i, { hours: Number(e.target.value) })}
                />
                <span id={`rem-hint-${row.key}`} className="field-hint" style={{ margin: 0 }}>
                  {t('hoursBefore')}
                </span>
              </div>
            </div>
          </div>
        ))}
        {error && <div role="alert" className="field-error">{error}</div>}
        {/*
          The shared bar (design review, 2026-10-07), which on a phone sticks to the bottom of the scroller.
          This was a hand-rolled copy of it — the same inline `marginTop: 16, display: flex, gap: 12` that
          GRW-416 wrote this component to stop being copied — so Save sat wherever the form happened to end.
        */}
        <SettingsSaveBar
          busy={busy}
          saved={saved}
          onSave={save}
          saveLabel={t('save')}
          savingLabel={t('saving')}
          // "Saved" alone would read as "done, it's working now". It is saved; it is not sending. Say both.
          savedLabel={whatsappLive ? t('saved') : t('savedNotLive')}
        />
      </div>
    </div>
    </>
  );
}
