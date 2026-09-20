'use client';

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
const ROLES = [
  { key: 'receptionist', label: 'Receptionist', sub: 'Runs the front desk' },
  { key: 'staff', label: 'Stylists', sub: 'See only their own day elsewhere' },
] as const;

const TABS = [
  { key: 'overview', label: 'Overview', money: true },
  { key: 'revenue', label: 'Revenue', money: true },
  { key: 'customers', label: 'Clients', money: false },
  { key: 'staff', label: 'Staff performance', money: false },
  { key: 'bookings', label: 'Bookings', money: false },
  { key: 'services', label: 'Services', money: false },
] as const;

const SAVE_ERROR = 'Could not save — check the server is running.';

export function ReportAccessForm({ initial }: { initial: SettingsSummary }) {
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
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">Who can see Reports</div>
      <div className="card-body">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 16 }}>
          You and your managers always see every report. Choose what anyone else gets. Tick nothing
          and Reports stays hidden from them entirely.
        </p>

        {ROLES.map((role) => (
          <div key={role.key} className="ra-role">
            <div className="ra-role-head">
              <span className="ra-role-name">{role.label}</span>
              <span className="ra-role-sub">{role.sub}</span>
            </div>
            <div className="ra-tabs">
              {TABS.map((tab) => (
                <label key={tab.key} className={`ra-tab ${has(role.key, tab.key) ? 'is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={has(role.key, tab.key)}
                    disabled={busy}
                    onChange={() => toggle(role.key, tab.key)}
                  />
                  <span>{tab.label}</span>
                  {/* Named, not hidden: an owner ticking "Overview" should know
                      it carries the day's takings before they tick it. */}
                  {tab.money && <span className="ra-money">shows money</span>}
                </label>
              ))}
            </div>
          </div>
        ))}

        {error && <div role="alert" className="field-error">{error}</div>}
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
