'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, formatMoney } from '../lib/api';
import { IconMinus, IconPlus } from '../components/icons';
import type { PosDailyToken, PosTokenItem } from './pos-helpers';

const keyOf = (i: PosTokenItem) => `${i.productId ?? ''}|${i.variantId ?? ''}|${i.name}`;
/** A dish on the card can be edited when it is a product line we know (a service leg, or a row from an older API, cannot). */
const editable = (i: PosTokenItem) => Boolean(i.productId) && (i.lines?.length ?? 0) > 0;

/**
 * Jira GRW-747 — owner, 2026-11-23: "keep it simple, should be able to edit in same card". An unpaid takeaway's dishes get − and + right on
 * its Pickup card; Save makes the order what the card shows. Fewer comes off the bill (the server's take-off: charged nothing, the kitchen
 * told, its stock given back); more adds the same dish (the server's Add items). No reason is asked: it is recorded as changed at the counter.
 * Asked only when the server must know: was a dish the kitchen got, and never ticked Done, already cooked?
 *
 * What the person wants is kept as the COUNT per dish, not as a difference: when a save stops part way (the cooked question, or another till
 * changed the order), the card reads the order again and the next Save works out what is still to do from what is there now.
 */
export default function PickupCardEdit({
  token,
  onClose,
  onSaved,
  onChanged,
}: {
  token: PosDailyToken;
  onClose: () => void;
  /** Saved: the board reads again and says so. */
  onSaved: (said: string) => void;
  /** Part of a save went through: read the order again, and stay open. */
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('pos');
  const tt = useTranslations('posTables');
  const [want, setWant] = useState<Record<string, number>>(() => Object.fromEntries(token.items.filter(editable).map((i) => [keyOf(i), i.qty])));
  const [askCooked, setAskCooked] = useState(false);
  const [cooked, setCooked] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = token.items;
  const unit = (i: PosTokenItem) => (i.qty > 0 ? i.paidMinor / i.qty : (i.priceMinor ?? 0));
  const countOf = (i: PosTokenItem) => (editable(i) ? (want[keyOf(i)] ?? i.qty) : i.qty);
  const amountOf = (i: PosTokenItem) => {
    const n = countOf(i);
    return n <= i.qty ? Math.round(unit(i) * n) : i.paidMinor + (i.priceMinor ?? 0) * (n - i.qty);
  };
  const nowMinor = rows.reduce((s, i) => s + amountOf(i), 0);
  const changed = rows.some((i) => editable(i) && countOf(i) !== i.qty);
  const nothingLeft = rows.every((i) => countOf(i) === 0);
  const set = (i: PosTokenItem, n: number) => setWant((w) => ({ ...w, [keyOf(i)]: Math.max(0, Math.min(99, n)) }));

  const save = async () => {
    if (!changed || nothingLeft || busy || (askCooked && cooked === undefined)) return;
    setBusy(true);
    setError(null);
    let wrote = false;
    try {
      const reason = t('editReason');
      for (const i of rows) {
        if (!editable(i)) continue;
        let off = i.qty - countOf(i);
        // Newest line first: what was added last comes off first.
        for (const line of [...(i.lines ?? [])].reverse()) {
          if (off <= 0) break;
          const take = Math.min(off, line.qty);
          await api.cancelBillItems(token.id, [line.id], reason, askCooked ? cooked : undefined, { qty: take, seenQty: line.qty });
          wrote = true;
          off -= take;
        }
      }
      const more = rows
        .filter((i) => editable(i) && countOf(i) > i.qty)
        .map((i) => {
          const n = countOf(i) - i.qty;
          return { productId: i.productId!, ...(i.variantId ? { variantId: i.variantId } : {}), qty: n, paidMinor: (i.priceMinor ?? 0) * n };
        });
      let total = nowMinor;
      if (more.length > 0) total = (await api.addToPendingCounterSale(token.id, more)).totalMinor;
      onSaved(t('editSaved', { token: token.tokenLabel, amount: formatMoney(String(total)) }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cooked_unknown') {
        setAskCooked(true);
      } else {
        setError(e instanceof ApiError ? e.message : t('editFailed'));
      }
      // Some of it may have gone through: show the order as it is now; the counts asked for stay, so Save finishes the rest.
      if (wrote || (e instanceof ApiError && e.code === 'line_changed')) await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pos-qedit">
      <ul className="pos-qcard-items pos-qedit-items">
        {rows.map((i, n) => (
          <li key={n} className={`pos-qcard-item pos-qedit-item${countOf(i) === 0 ? ' is-off' : ''}`}>
            {editable(i) ? (
              <span className="pos-qedit-step" role="group" aria-label={i.name}>
                <button type="button" className="pos-qedit-btn" aria-label={t('editLess', { name: i.name })} disabled={busy || countOf(i) <= 0} onClick={() => set(i, countOf(i) - 1)}>
                  <IconMinus />
                </button>
                <span className="pos-qedit-n" aria-live="polite">
                  {countOf(i)}
                </span>
                <button type="button" className="pos-qedit-btn" aria-label={t('editMore', { name: i.name })} disabled={busy} onClick={() => set(i, countOf(i) + 1)}>
                  <IconPlus />
                </button>
              </span>
            ) : (
              <span className="pos-qcard-item-qty">{i.qty}×</span>
            )}
            <span className="pos-qcard-item-name">{i.name}</span>
            <span className="pos-qcard-item-amt">{formatMoney(String(amountOf(i)))}</span>
          </li>
        ))}
      </ul>
      <p className="pos-qedit-now">
        <span>{t('editNow')}</span>
        <strong>{formatMoney(String(nowMinor))}</strong>
      </p>
      {nothingLeft ? (
        <p className="field-hint pos-qedit-warn" role="status">
          {t('editEverythingOff')}
        </p>
      ) : null}
      {askCooked ? (
        <fieldset className="tb-cooked">
          <legend className="field-hint">{tt('cookedQuestion')}</legend>
          <div className="tb-cooked-pair">
            <button type="button" className={`btn btn-ghost ${cooked === false ? 'is-on' : ''}`} aria-pressed={cooked === false} onClick={() => setCooked(false)}>
              {tt('cookedNo')}
            </button>
            <button type="button" className={`btn btn-ghost ${cooked === true ? 'is-on' : ''}`} aria-pressed={cooked === true} onClick={() => setCooked(true)}>
              {tt('cookedYes')}
            </button>
          </div>
          <span className="field-hint">{tt('cookedHint')}</span>
        </fieldset>
      ) : null}
      {error ? (
        <p className="al-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="pos-qedit-bar">
        <button type="button" className="btn btn-primary" disabled={!changed || nothingLeft || busy || (askCooked && cooked === undefined)} onClick={() => void save()}>
          {t('editSave')}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          {tt('cancel')}
        </button>
      </div>
    </div>
  );
}
