'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError, formatMoney } from '../lib/api';
import type { DeliveryAppTally, DeliveryAppTallyRow, DeliveryTallyRange } from '../lib/api-types';
import { DEFAULT_PAYOUT_RANGE, PAYOUT_RANGES, parsePercent, payoutRowState, percentText } from '../lib/delivery-payout';
import { useBranch } from '../components/BranchProvider';

/**
 * Jira GRW-658 — what Swiggy and Zomato should pay you, above the Orders list.
 *
 * The figures are the API's; this card never adds a rupee. It picks a period, draws a block per app, and lets the OWNER type the app's
 * commission where the missing number is felt (not in a Settings screen three taps away). An order keeps the commission it was entered at,
 * so changing it here reaches only the orders after it — the card says nothing about that, because nothing it shows is rewritten.
 *
 * Laid out at 344px: one column, a block per app, the chips wrapping rather than scrolling. A 403 or 404 on the first read means this
 * viewer is not meant to see money (or the business has no apps): the card is simply absent, not an error.
 */
export function PayoutCard({ mayEdit }: { mayEdit: boolean }) {
  const t = useTranslations('orders.payout');
  const tChannels = useTranslations('orders.channels');
  const locale = useLocale();
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? branchContext.choice : null;

  const [range, setRange] = useState<DeliveryTallyRange>(DEFAULT_PAYOUT_RANGE);
  const [data, setData] = useState<DeliveryAppTally | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const requestId = useRef(0);

  const load = useCallback((r: DeliveryTallyRange, location: string | null) => {
    const mine = ++requestId.current;
    setLoading(true);
    api
      .deliveryAppTally({ range: r, location })
      .then((res) => {
        // A slower, older answer must not overwrite a newer one.
        if (mine !== requestId.current) return;
        setData(res);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (mine !== requestId.current) return;
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) setHidden(true);
        else setFailed(true);
      })
      .finally(() => {
        if (mine === requestId.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load(range, branch);
  }, [range, branch, load]);

  if (hidden) return null;
  const money = (minor: string | null) => formatMoney(minor, 'INR', locale);
  const rangeLabel: Record<DeliveryTallyRange, string> = {
    today: t('ranges.today'),
    this_week: t('ranges.thisWeek'),
    last_week: t('ranges.lastWeek'),
    this_month: t('ranges.thisMonth'),
  };

  return (
    <section className="pay card" aria-labelledby="pay-title" aria-busy={loading}>
      <h2 className="pay-title" id="pay-title">
        {t('title')}
      </h2>
      <div className="ord-chips" role="group" aria-label={t('rangeLabel')}>
        {PAYOUT_RANGES.map((r) => (
          <button key={r} type="button" className={`ord-chip${r === range ? ' is-on' : ''}`} aria-pressed={r === range} onClick={() => setRange(r)}>
            {rangeLabel[r]}
          </button>
        ))}
      </div>

      {failed ? (
        <div className="pay-error" role="alert">
          <span>{t('loadFailed')}</span>
          <button type="button" className="btn btn-ghost" onClick={() => load(range, branch)}>
            {t('retry')}
          </button>
        </div>
      ) : !data ? (
        <div className="pay-skeleton" aria-hidden="true">
          <span />
          <span />
        </div>
      ) : (
        <>
          {!data.anyOrders ? <p className="pay-empty">{t('empty')}</p> : null}
          <ul className="pay-apps">
            {data.apps.map((row) => (
              <AppBlock key={row.app} row={row} name={tChannels(row.app)} money={money} mayEdit={mayEdit} onSaved={() => load(range, branch)} />
            ))}
          </ul>
          <p className="pay-note">{t('note')}</p>
        </>
      )}
    </section>
  );
}

function AppBlock({
  row,
  name,
  money,
  mayEdit,
  onSaved,
}: {
  row: DeliveryAppTallyRow;
  name: string;
  money: (minor: string | null) => string;
  mayEdit: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations('orders.payout');
  const state = payoutRowState(row);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setDraft(percentText(row.commissionBp));
    setError(null);
    setEditing(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parsePercent(draft);
    if (!parsed.ok) {
      setError(t('invalidPercent'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.setDeliveryAppCommission(row.app, parsed.percent);
      setEditing(false);
      onSaved();
    } catch {
      setError(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const inputId = `pay-${row.app}-percent`;
  return (
    <li className="pay-app">
      <div className="pay-app-head">
        <span className="pay-app-name">{name}</span>
        <span className="pay-app-count">{t('orders', { count: row.orders })}</span>
      </div>

      {state !== 'empty' ? (
        <dl className="pay-figures">
          <div>
            <dt>{t('orderTotal')}</dt>
            <dd>{money(row.billedMinor)}</dd>
          </div>
          {state === 'ready' ? (
            <div>
              <dt>{t('commission')}</dt>
              <dd>{money(row.commissionMinor)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {state === 'ready' ? (
        <p className="pay-should">
          <span>{t('shouldPay', { app: name })}</span>
          <strong>{money(row.shouldPayMinor)}</strong>
        </p>
      ) : null}
      {state === 'unset' ? <p className="pay-hint">{t('addCommission')}</p> : null}
      {state === 'partial' ? <p className="pay-hint">{t('someWithout', { count: row.ordersWithoutCommission })}</p> : null}

      {mayEdit ? (
        editing ? (
          <form className="pay-edit" onSubmit={save} noValidate>
            <label className="field-label" htmlFor={inputId}>
              {t('commissionLabel', { app: name })}
            </label>
            <div className="pay-edit-row">
              <input id={inputId} type="text" inputMode="decimal" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={`${inputId}-hint`} />
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {t('save')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
                {t('cancel')}
              </button>
            </div>
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : (
              <p className="field-hint" id={`${inputId}-hint`}>
                {t('clearHint')}
              </p>
            )}
          </form>
        ) : (
          <button type="button" className="pay-commission" onClick={open}>
            {row.commissionBp === null ? t('setCommission') : t('commissionNow', { percent: percentText(row.commissionBp) })}
          </button>
        )
      ) : null}
    </li>
  );
}
