'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';

/**
 * GRW-166 — whether stylists see who a booking is for. A privacy decision rather than a booking rule, worded
 * for an owner: what their team can see, not what the API returns.
 *
 * Jira GRW-396 — moved here from Booking rules. It is the whole business's decision (GRW-248), and Booking
 * rules became one branch's tab, so it sits with the other "who sees what" decision.
 */
export function ClientContactForm({ initial }: { initial: SettingsSummary }) {
  const t = useTranslations('settingsReports');
  const [on, setOn] = useState(initial.booking.staffSeesClientContact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (next: boolean) => {
    setOn(next);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const fresh = await api.updateBookingRules({ staffSeesClientContact: next });
      setOn(fresh.booking.staffSeesClientContact);
      setSaved(true);
    } catch {
      setOn(!next);
      setError(t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">{t('contactTitle')}</div>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <label className="switch" style={{ marginTop: 2 }}>
            <input type="checkbox" aria-labelledby="rule-staff-sees-label" checked={on} disabled={busy} onChange={() => void save(!on)} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
          <div style={{ flex: 1 }}>
            <div id="rule-staff-sees-label" style={{ fontWeight: 620, fontSize: 14.5 }}>
              {t('staffSees')}
            </div>
            <span className="field-hint" style={{ margin: '4px 0 0' }}>
              {on ? t('staffSeesOn') : t('staffSeesOff')}
            </span>
          </div>
        </div>
        {error && <div role="alert" className="field-error">{error}</div>}
        {saved && !busy && !error ? (
          <span className="field-hint" role="status" style={{ margin: '10px 0 0', color: 'var(--accent-deep)' }}>
            {t('saved')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
