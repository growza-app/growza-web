'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, formatMoney, type RewardSettings } from '../../lib/api';
import { SettingsSaveBar } from '../SettingsSaveBar';
import { InfoTip } from '../../components/InfoTip';
import { useCloseAfterSave } from '../../lib/close-after-save';

/**
 * Jira GRW-648 — a switch and two numbers.
 *
 * Three fields is the whole screen, and that is a decision rather than a first cut. A loyalty scheme has half
 * a dozen numbers in it — what a point is worth, the most a bill may take, the fewest points spendable at
 * once — and every one of them is a sentence an owner would have to be taught before the field meant
 * anything. The three here are the ones they already have an opinion about: whether to do it at all, how
 * generous to be, and how long the promise lasts. The rest are the platform's until somebody asks.
 *
 * One Save for the lot, not a switch that saves itself. Turning the scheme on and setting its rate in the
 * same breath is one decision; saving the switch first would start a business earning at a rate its owner was
 * still typing.
 *
 * The rate is shown as a PERCENT and stored as basis points. An owner thinks in "two percent"; the capability
 * keeps the unit the engine divides by, and nowhere in between is there a second number to keep true.
 */

/** A bill to show the rate against. Round, ordinary, and large enough that 1% is not nothing. */
const EXAMPLE_BILL_MINOR = 100_000;

/** How long points last, in the answers a business actually means. Any above the platform's ceiling are dropped. */
const EXPIRY_CHOICES = [
  { days: 180, key: 'expiry.180' },
  { days: 365, key: 'expiry.365' },
  { days: 730, key: 'expiry.730' },
] as const;

/** The same arithmetic the engine does (`pointsEarned`): paise of the bill, then paise to points, both floored. */
export function pointsFor(billMinor: number, earnBps: number, pointValueMinor: number): number {
  const valueMinor = Math.floor((billMinor * earnBps) / 10_000);
  return Math.floor(valueMinor / Math.max(1, pointValueMinor));
}

/** What the owner typed, as basis points — `2.5` is 250. Null when it is not a number this field accepts. */
export function bpsOf(percent: string): number | null {
  const trimmed = percent.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function RewardsForm({ initial }: { initial: RewardSettings | null }) {
  const t = useTranslations('settingsRewards');
  const closeForm = useCloseAfterSave('/settings');

  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [percent, setPercent] = useState(((initial?.earnBps ?? 200) / 100).toString());
  const [expiryDays, setExpiryDays] = useState(String(initial?.expiryDays ?? 365));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!initial) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="field-hint">{t('loadFailed')}</p>
        </div>
      </div>
    );
  }

  /*
   * Two ways this screen has nothing to offer, and they are different sentences.
   *
   * `available` false is the platform or this vertical saying points are not a thing here. `changeable` false
   * is a business between subscriptions: the choice is stored as an override on the live one, so there is
   * nowhere to put it. Both replace the form rather than disabling it — a greyed-out switch invites somebody
   * to keep tapping, and the only thing worth saying is why they cannot.
   */
  if (!initial.available || !initial.changeable) {
    return (
      <div className="card">
        <div className="card-body">
          <h2 className="rw-blocked-title">{t('cannot')}</h2>
          <p className="field-hint">{initial.available ? t('noSubscription') : t('notAvailable')}</p>
        </div>
      </div>
    );
  }

  const bps = bpsOf(percent);
  const maxPercent = initial.maxEarnBps / 100;
  const badRate = enabled && (bps === null || bps > initial.maxEarnBps);
  const days = Number(expiryDays);

  const save = async () => {
    if (badRate) {
      setError(t('rateBad', { max: maxPercent }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The rate and the expiry go with the switch even when it is being turned off, so an owner who sets a
      // rate and switches on next month gets the rate they chose rather than the one they left behind.
      await api.saveRewardSettings({ enabled, earnBps: bps ?? initial.earnBps, expiryDays: days });
      closeForm();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  /** The rate in the owner's own terms, rebuilt as they type: what one ordinary bill actually gives. */
  const earned = bps === null ? null : pointsFor(EXAMPLE_BILL_MINOR, bps, initial.pointValueMinor);

  return (
    <>
      <div className="card rw-rewards">
        <div className="card-body">
          <p className="field-hint rw-intro">{t('intro')}</p>

          <div className="rw-row">
            <label className="switch">
              <input
                type="checkbox"
                aria-labelledby="rw-switch-label"
                checked={enabled}
                disabled={busy}
                onChange={() => {
                  setEnabled(!enabled);
                  setError(null);
                }}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </label>
            <div>
              <div id="rw-switch-label" className="rw-row-title">
                {t('switchLabel')}
                {/*
                  Jira GRW-648 (owner, 2026-10-25) — the whole scheme in one bubble, because every number on
                  this screen is part of one rule and an owner reading them one at a time cannot see it.
                */}
                <InfoTip label={t('switchLabel')}>{t('tips.how')}</InfoTip>
              </div>
              <span className="field-hint">{t('switchHint')}</span>
            </div>
          </div>

          {/* The two numbers only exist for a business that is doing this at all. */}
          {enabled && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="rw-rate">
                  {t('rateLabel')}
                  <InfoTip label={t('rateLabel')}>{t('tips.earning')}</InfoTip>
                </label>
                <div className="rw-suffixed">
                  <input
                    id="rw-rate"
                    // `inputMode` decimal, not `type="number"`: a phone keypad with a full stop on it, and no
                    // spinner arrows to nudge a rate by accident.
                    type="text"
                    inputMode="decimal"
                    maxLength={6}
                    value={percent}
                    disabled={busy}
                    aria-invalid={badRate || undefined}
                    onChange={(e) => {
                      setPercent(e.target.value);
                      setError(null);
                    }}
                  />
                  <span aria-hidden="true">%</span>
                </div>
                <span className="field-hint">
                  {earned === null
                    ? t('rateBad', { max: maxPercent })
                    : t('rateHint', {
                        bill: formatMoney(String(EXAMPLE_BILL_MINOR)),
                        points: earned,
                        off: formatMoney(String(earned * initial.pointValueMinor)),
                      })}
                </span>
                <span className="field-hint">{t('rateMax', { max: maxPercent })}</span>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="rw-expiry">
                  {t('expiryLabel')}
                  <InfoTip label={t('expiryLabel')}>{t('tips.expiry')}</InfoTip>
                </label>
                {/*
                  A short list rather than a box for a number of days: nobody has an opinion about 400 days,
                  and the four answers here are the ones a business actually means. "Never" is 0, which is how
                  `expiryFor` already reads it.
                */}
                <select
                  id="rw-expiry"
                  value={expiryDays}
                  disabled={busy}
                  onChange={(e) => {
                    setExpiryDays(e.target.value);
                    setError(null);
                  }}
                >
                  {EXPIRY_CHOICES.filter((c) => c.days <= initial.maxExpiryDays).map((c) => (
                    <option key={c.days} value={c.days}>
                      {t(c.key)}
                    </option>
                  ))}
                  <option value={0}>{t('expiry.never')}</option>
                </select>
                <span className="field-hint">{t('expiryHint')}</span>
              </div>

              {/* What the till will do with the points, which this screen does not set but the owner has to know. */}
              <p className="field-hint rw-till">
                <InfoTip label={t('tillLabel')}>{t('tips.spending')}</InfoTip>
                {t('tillRule', {
                  cap: initial.redeemCapBps / 100,
                  floor: initial.minRedeemPoints,
                  worth: formatMoney(String(initial.pointValueMinor)),
                })}
              </p>
            </>
          )}

          {error && (
            <p className="rw-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <SettingsSaveBar busy={busy} onSave={save} saveLabel={t('save')} savingLabel={t('saving')} />
    </>
  );
}
