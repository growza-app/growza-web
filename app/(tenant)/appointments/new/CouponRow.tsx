'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatMoney } from '../../lib/api';
import { localiseApiMessage } from '../../lib/api-messages';
import { IconClose } from '../../components/icons';

/**
 * Jira GRW-735 — the payment screen's offers: each buy-get offer the bill took ("Cold Drink — buy 1 get 1  −₹30"), and
 * a Coupon code field. A typed code is asked of the server; the answer is shown where it was typed — the coupon's
 * name and amount, or the plain reason it is not good ("That code ended on 30 Nov"), or that the counter's discount
 * was larger and is the one kept (BR-01). Nothing is worked out here.
 */
export function OfferLines({ bogo }: { bogo: ReadonlyArray<{ name: string; offMinor: number }> }) {
  const t = useTranslations('payFlow.offers');
  if (bogo.length === 0) return null;
  return (
    <ul className="pf-offers" aria-label={t('applied')}>
      {bogo.map((o) => (
        <li key={o.name} className="pf-offer">
          <span className="pf-offer-name">{o.name}</span>
          <strong className="pf-offer-off">−{formatMoney(String(o.offMinor))}</strong>
        </li>
      ))}
    </ul>
  );
}

export function CouponRow({
  code,
  coupon,
  refusal,
  kept,
  checking,
  disabled,
  onApply,
  onRemove,
}: {
  code: string | null;
  coupon: { code: string | null; name: string; offMinor: number } | null;
  refusal: string | null;
  kept: 'coupon' | 'discount' | null;
  checking: boolean;
  disabled: boolean;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('payFlow.offers');
  const locale = useLocale();
  const [typed, setTyped] = useState(code ?? '');
  const money = (minor: number) => formatMoney(String(minor));
  if (code) {
    return (
      <div className="pf-coupon is-on" role="group" aria-label={t('coupon')}>
        <span className="pf-coupon-words">
          {checking ? t('checking') : coupon ? (kept === 'discount' ? t('discountKept', { name: coupon.name }) : t('couponOn', { name: coupon.name })) : refusal ? localiseApiMessage(refusal, locale) : code}
        </span>
        {coupon && kept !== 'discount' && !checking ? <strong className="pf-coupon-off">−{money(coupon.offMinor)}</strong> : null}
        <button type="button" className="btn btn-ghost pf-coupon-remove" aria-label={t('remove')} disabled={disabled} onClick={onRemove}>
          <IconClose />
        </button>
        {refusal && !checking ? (
          <p className="pf-coupon-refused" role="alert">
            {localiseApiMessage(refusal, locale)}
          </p>
        ) : null}
        {coupon && kept === 'coupon' && !checking ? <p className="field-hint pf-coupon-note">{t('couponKept')}</p> : null}
      </div>
    );
  }
  return (
    <form
      className="pf-coupon"
      aria-label={t('coupon')}
      onSubmit={(e) => {
        e.preventDefault();
        if (typed.trim()) onApply(typed.trim().toUpperCase());
      }}
    >
      <label className="pf-coupon-field">
        <span className="sr-only">{t('coupon')}</span>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder={t('coupon')}
          maxLength={20}
          value={typed}
          disabled={disabled}
          onChange={(e) => setTyped(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
        />
      </label>
      <button type="submit" className="btn btn-ghost pf-coupon-apply" disabled={disabled || typed.trim().length < 3}>
        {t('apply')}
      </button>
    </form>
  );
}
