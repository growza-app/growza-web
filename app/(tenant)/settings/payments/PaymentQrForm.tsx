'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, type PaymentQrState } from '../../lib/api';
import { useWritable } from '../../components/SessionProvider';

/**
 * The QR the owner holds up, uploaded once.
 *
 * Deliberately not a form with a Save: an upload IS the change, and every call
 * answers with the whole state, so there is one source of truth on screen and
 * nothing to submit. Same shape as the business logo on Settings › Profile.
 *
 * A branch's own QR overrides the business's. The card for a branch that has
 * none says so in words rather than showing an empty frame, because an empty
 * frame reads as "broken" where the till is in fact showing something.
 */
export function PaymentQrForm({ initial }: { initial: PaymentQrState }) {
  const t = useTranslations('settingsPayments');
  const writable = useWritable();
  const [state, setState] = useState(initial);
  /** Which card is mid-upload: `business`, or a branch id. Nothing else may be tapped while one is. */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const run = async (who: string, call: () => Promise<PaymentQrState>) => {
    setBusy(who);
    setError(null);
    try {
      setState(await call());
    } catch {
      setError(t('errors.failed'));
    } finally {
      setBusy(null);
      const input = inputs.current[who];
      // Cleared so choosing the SAME file again still fires `change`.
      if (input) input.value = '';
    }
  };

  const multi = state.branches.length > 1;

  const card = (who: string, title: string, sub: string, qr: string | null, upload: (file: File) => Promise<PaymentQrState>, remove: (() => Promise<PaymentQrState>) | null) => (
    <section className="card pq-card" key={who}>
      <div className="pq-head">
        <div>
          <h2 className="pq-title">{title}</h2>
          <p className="pq-sub">{sub}</p>
        </div>
      </div>
      <div className="pq-body">
        <div className="pq-preview">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={t('alt', { what: title })} />
          ) : (
            <span className="pq-none">{t('none')}</span>
          )}
        </div>
        <div className="pq-actions">
          <button type="button" className="btn pq-btn" disabled={!writable || busy !== null} onClick={() => inputs.current[who]?.click()}>
            {busy === who ? t('uploading') : qr ? t('change') : t('upload')}
          </button>
          {qr && remove ? (
            <button type="button" className="pq-remove" disabled={!writable || busy !== null} onClick={() => void run(who, remove)}>
              {t('remove')}
            </button>
          ) : null}
          <input
            ref={(el) => {
              inputs.current[who] = el;
            }}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void run(who, () => upload(file));
            }}
          />
        </div>
      </div>
    </section>
  );

  return (
    <div className="pq">
      <p className="pq-lede">{t('lede')}</p>
      {error ? (
        <div role="alert" className="pq-error">
          {error}
        </div>
      ) : null}

      {card(
        'business',
        multi ? t('business.titleMulti') : t('business.title'),
        multi ? t('business.subMulti') : t('business.sub'),
        state.paymentQrUrl,
        (file) => api.uploadPaymentQr(file),
        () => api.removePaymentQr(),
      )}

      {/*
        One card per branch, and only where there is more than one — with a single branch the business card IS
        that branch's, and a second card for it would be the same picture asked for twice.
      */}
      {multi
        ? state.branches.map((b) =>
            card(
              b.id,
              b.name,
              b.paymentQrUrl ? t('branch.own') : state.paymentQrUrl ? t('branch.usingBusiness') : t('branch.nothing'),
              b.paymentQrUrl,
              (file) => api.uploadBranchPaymentQr(b.id, file),
              b.paymentQrUrl ? () => api.removeBranchPaymentQr(b.id) : null,
            ),
          )
        : null}
    </div>
  );
}
