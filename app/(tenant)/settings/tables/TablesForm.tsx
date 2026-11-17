'use client';

import { useTranslations } from 'next-intl';
import Link from '../../../shared/AppLink';
import { useState } from 'react';
import { api, ApiError, type BranchTableOrders } from '../../lib/api';
import { useWritable } from '../../components/SessionProvider';

/**
 * Jira GRW-718 — one switch per branch: "MG Road seats its guests, Airport does not".
 *
 * Each switch saves on its own, like Phone alerts and for the same reason: it is one decision per branch, made and
 * walked away from, and a Save bar afterwards is how an owner ends up thinking a branch is on when it is not.
 *
 * Switching OFF can be refused — a table at that branch still has an open bill — and then the switch stays where it
 * was and the row says why, in the API's own words ("3 tables still have open bills…"). The switch never shows a
 * state the server did not accept.
 *
 * The rows reuse Phone alerts' switch rows (`al-list`, `al-row`) rather than a second copy of the same layout.
 *
 * Jira GRW-719 — a branch that is on leads to its room ("Set up tables ›"). A manager sees only those links: they
 * set rooms up, but the switches are the owner's (`canSwitch`).
 */
export function TablesForm({ initial, canSwitch }: { initial: BranchTableOrders[] | null; canSwitch: boolean }) {
  const t = useTranslations('settingsTables');
  const writable = useWritable();
  const [branches, setBranches] = useState(initial);
  /** Which branch is mid-save, so one slow request holds one row rather than the screen. */
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<{ branchId: string; message: string } | null>(null);

  if (!branches) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="field-hint">{t('loadFailed')}</p>
        </div>
      </div>
    );
  }

  const toggle = async (branch: BranchTableOrders) => {
    setError(null);
    setSaving(branch.id);
    try {
      const answer = await api.setTableOrders(branch.id, !branch.on);
      setBranches(answer.branches);
    } catch (e) {
      setError({ branchId: branch.id, message: e instanceof ApiError ? e.message : t('saveFailed') });
    } finally {
      setSaving(null);
    }
  };

  const one = branches.length === 1;
  if (!canSwitch && branches.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="field-hint">{t('noneOnForManager')}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="card al-alerts">
      <div className="card-body">
        <p className="field-hint al-intro">{canSwitch ? t('intro') : t('introManager')}</p>
        <ul className="al-list">
          {branches.map((branch) => {
            const id = `tb-${branch.id}`;
            return (
              <li className="al-row" key={branch.id}>
                {canSwitch ? (
                <label className="switch">
                  <input
                    type="checkbox"
                    aria-labelledby={`${id}-label`}
                    aria-describedby={`${id}-hint`}
                    checked={branch.on}
                    disabled={saving !== null || !writable}
                    onChange={() => toggle(branch)}
                  />
                  <span className="switch-track">
                    <span className="switch-thumb" />
                  </span>
                </label>
                ) : null}
                <div className="dt-branch">
                  <div id={`${id}-label`} className="al-row-title">
                    {one ? t('oneBranchTitle') : branch.name}
                  </div>
                  <span id={`${id}-hint`} className="field-hint">
                    {branch.on ? t('onHint') : t('offHint')}
                  </span>
                  {/* Owner, 17 Nov 2026 — the reason the switch did not move sits by the switch, not below the rest of the card. */}
                  {error?.branchId === branch.id ? (
                    <p className="al-error" role="alert">
                      {error.message}
                    </p>
                  ) : null}
                  {branch.on ? (
                    <Link className="dt-setup-link" href={`/settings/tables/${branch.id}`}>
                      {t('setUp')}
                    </Link>
                  ) : null}
                  {branch.on && canSwitch ? (
                    <ServiceChargeOffer branch={branch} disabled={saving !== null || !writable} onSaved={setBranches} />
                  ) : null}
                  {canSwitch ? <KitchenLate branch={branch} disabled={saving !== null || !writable} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Jira GRW-724 — the service charge a branch OFFERS, and its rate. Never added by itself (CCPA, July 2022): the counter adds it on a bill
 * only when the guest agrees, and the guest can always say no. Saved on its own, as the switch above is; a rate the API refuses stays on
 * screen with the API's words ("0 to 20%").
 */
function ServiceChargeOffer({
  branch,
  disabled,
  onSaved,
}: {
  branch: BranchTableOrders;
  disabled: boolean;
  onSaved: (branches: BranchTableOrders[]) => void;
}) {
  const t = useTranslations('settingsTables');
  const on = branch.serviceChargeOn ?? false;
  const [rate, setRate] = useState(String((branch.serviceChargeBp ?? 0) / 100 || 5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `sc-${branch.id}`;
  const save = async (nextOn: boolean) => {
    setError(null);
    const pct = Number(rate);
    if (rate.trim() === '' || !Number.isFinite(pct)) {
      setError(t('serviceChargeRange'));
      return;
    }
    setBusy(true);
    try {
      onSaved((await api.setServiceChargeOffer(branch.id, nextOn, pct)).branches);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dt-sc">
      <label className="dt-sc-row">
        <span className="switch">
          <input type="checkbox" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} checked={on} disabled={disabled || busy} onChange={() => void save(!on)} />
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
        </span>
        <span id={`${id}-label`} className="al-row-title">
          {t('serviceCharge')}
        </span>
      </label>
      <span id={`${id}-hint`} className="field-hint">
        {t('serviceChargeHint')}
      </span>
      <div className="dt-sc-rate">
        <label className="dt-field">
          <span className="field-hint">{t('serviceChargeRate')}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={20}
            step={0.5}
            value={rate}
            disabled={disabled || busy}
            aria-label={t('serviceChargeRate')}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <button type="button" className="btn btn-ghost" disabled={disabled || busy || Number(rate) * 100 === (branch.serviceChargeBp ?? -1)} onClick={() => void save(on)}>
          {t('serviceChargeSave')}
        </button>
      </div>
      {error ? (
        <p className="al-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Jira GRW-714 — after how many minutes a kitchen card turns late (amber, and it says "Late"). Owner only, per branch. */
function KitchenLate({ branch, disabled }: { branch: BranchTableOrders; disabled: boolean }) {
  const t = useTranslations('settingsTables');
  const [minutes, setMinutes] = useState(String(branch.kitchenLateMinutes ?? 15));
  const [saved, setSaved] = useState(String(branch.kitchenLateMinutes ?? 15));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const out = await api.setKitchenLate(branch.id, Number(minutes));
      setSaved(String(out.lateMinutes));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dt-sc">
      <div className="dt-sc-rate">
        <label className="dt-field">
          <span className="field-hint">{t('kitchenLate')}</span>
          <input type="number" inputMode="numeric" min={1} max={240} value={minutes} disabled={disabled || busy} aria-label={t('kitchenLate')} onChange={(e) => setMinutes(e.target.value)} />
        </label>
        <button type="button" className="btn btn-ghost" disabled={disabled || busy || minutes === saved} onClick={() => void save()}>
          {t('kitchenLateSave')}
        </button>
      </div>
      {error ? (
        <p className="al-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
