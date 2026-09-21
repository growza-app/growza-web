'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';

/**
 * Jira GRW-63 · GRW-197 — who else may open Reports, and which tabs.
 *
 * A per-salon decision rather than one the codebase should take. A receptionist
 * managing staff and clients plausibly needs the client and staff reports;
 * whether she should see what the salon earns is the owner's business.
 *
 * Tabs rather than a single switch, because "can see reports" is not one
 * decision — the money and the operational half are different disclosures and
 * an owner will reasonably want to split them.
 *
 * Owner and manager are absent from this screen on purpose: they already reach
 * every report, so a control for them could not do anything, and a control
 * that cannot do anything is worse than no control.
 */
/** Each role and tab is named in `settingsReports.roles` / `.tabs`; the key is also what the API stores. */
const ROLES = ['receptionist', 'staff'] as const;

const TABS = [
  { key: 'overview', money: true },
  { key: 'revenue', money: true },
  { key: 'customers', money: false },
  { key: 'staff', money: false },
  { key: 'bookings', money: false },
  { key: 'services', money: false },
] as const;

export function ReportAccessForm({ initial }: { initial: SettingsSummary }) {
  const t = useTranslations('settingsReports');
  const [granted, setGranted] = useState<Record<string, string[]>>(() => ({ ...initial.reportAccess }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const has = (role: string, tab: string) => (granted[role] ?? []).includes(tab);

  const toggle = (role: string, tab: string) => {
    setSaved(false);
    setGranted((prev) => {
      const current = prev[role] ?? [];
      const next = current.includes(tab) ? current.filter((t) => t !== tab) : [...current, tab];
      return { ...prev, [role]: next };
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const fresh = await api.updateBookingRules({ reportAccess: granted });
      // Taken from the server's answer rather than kept locally: it drops a
      // role granted nothing, and the screen should show what was stored.
      setGranted({ ...fresh.reportAccess });
      setSaved(true);
    } catch {
      setError(t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">{t('title')}</div>
      <div className="card-body">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 16 }}>
          {t('hint')}
        </p>

        {ROLES.map((role) => (
          <div key={role} className="ra-role">
            <div className="ra-role-head">
              <span className="ra-role-name">{t(`roles.${role}.label`)}</span>
              <span className="ra-role-sub">{t(`roles.${role}.sub`)}</span>
            </div>
            <div className="ra-tabs">
              {TABS.map((tab) => (
                <label key={tab.key} className={`ra-tab ${has(role, tab.key) ? 'is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={has(role, tab.key)}
                    disabled={busy}
                    onChange={() => toggle(role, tab.key)}
                  />
                  <span>{t(`tabs.${tab.key}`)}</span>
                  {/* Named, not hidden: an owner ticking "Overview" should know
                      it carries the day's takings before they tick it. */}
                  {tab.money && <span className="ra-money">{t('showsMoney')}</span>}
                </label>
              ))}
            </div>
          </div>
        ))}

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
  );
}
