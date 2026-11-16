'use client';

import { useTranslations } from 'next-intl';
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
 */
export function TablesForm({ initial }: { initial: BranchTableOrders[] | null }) {
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
  return (
    <div className="card al-alerts">
      <div className="card-body">
        <p className="field-hint al-intro">{t('intro')}</p>
        <ul className="al-list">
          {branches.map((branch) => {
            const id = `tb-${branch.id}`;
            return (
              <li className="al-row" key={branch.id}>
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
                <div>
                  <div id={`${id}-label`} className="al-row-title">
                    {one ? t('oneBranchTitle') : branch.name}
                  </div>
                  <span id={`${id}-hint`} className="field-hint">
                    {branch.on ? t('onHint') : t('offHint')}
                  </span>
                  {error?.branchId === branch.id ? (
                    <p className="al-error" role="alert">
                      {error.message}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
