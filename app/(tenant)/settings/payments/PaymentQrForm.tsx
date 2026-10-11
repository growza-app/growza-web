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
 * **One card, then a list** (owner, 2026-10-11). The first draft gave every
 * branch a card of its own with a 176px empty frame in it, which at five
 * branches was a screen and a half of white boxes saying "No QR yet" — and the
 * usual state for a branch is exactly that, because it shows the business's.
 * So the business's QR is the card, and the branches are rows under it: a
 * thumbnail, the branch, what it shows, and the one action, each on one line.
 */
export function PaymentQrForm({ initial }: { initial: PaymentQrState }) {
  const t = useTranslations('settingsPayments');
  const writable = useWritable();
  const [state, setState] = useState(initial);
  /** Which card or row is mid-upload: `business`, or a branch id. Nothing else may be tapped while one is. */
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

  const picker = (who: string, upload: (file: File) => Promise<PaymentQrState>) => (
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
  );

  const multi = state.branches.length > 1;

  return (
    <div className="pq">
      <section className="card pq-card">
        <div className="pq-main">
          <div className={`pq-shot ${state.paymentQrUrl ? '' : 'pq-shot-empty'}`}>
            {state.paymentQrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.paymentQrUrl} alt={t('alt', { what: multi ? t('business.titleMulti') : t('business.title') })} />
            ) : null}
          </div>
          <div className="pq-words">
            <h2 className="pq-title">{multi ? t('business.titleMulti') : t('business.title')}</h2>
            <p className="pq-sub">{multi ? t('business.subMulti') : t('business.sub')}</p>
            {/* The one thing that makes a QR hard to scan, said before it happens rather than after. */}
            <p className="pq-tip">{t('tip')}</p>
          </div>
        </div>
        <div className="pq-actions">
          <button type="button" className="btn pq-btn" disabled={!writable || busy !== null} onClick={() => inputs.current.business?.click()}>
            {busy === 'business' ? t('uploading') : state.paymentQrUrl ? t('change') : t('upload')}
          </button>
          {state.paymentQrUrl ? (
            <button type="button" className="pq-remove" disabled={!writable || busy !== null} onClick={() => void run('business', () => api.removePaymentQr())}>
              {t('remove')}
            </button>
          ) : null}
          {picker('business', (file) => api.uploadPaymentQr(file))}
        </div>
      </section>

      {error ? (
        <div role="alert" className="pq-error">
          {error}
        </div>
      ) : null}

      {/*
        One row per branch, and only where there is more than one — with a single branch the card above IS that
        branch's, and a row repeating it would be the same picture asked for twice.
      */}
      {multi ? (
        <section className="card pq-card">
          <h2 className="pq-title">{t('branch.heading')}</h2>
          <ul className="pq-list">
            {state.branches.map((b) => (
              <li className="pq-row" key={b.id}>
                <span className={`pq-thumb ${b.paymentQrUrl ? '' : 'pq-thumb-empty'}`}>
                  {b.paymentQrUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.paymentQrUrl} alt={t('alt', { what: b.name })} />
                  ) : null}
                </span>
                <span className="pq-row-words">
                  <span className="pq-row-name">{b.name}</span>
                  <span className="pq-row-sub">{b.paymentQrUrl ? t('branch.own') : state.paymentQrUrl ? t('branch.usingBusiness') : t('branch.nothing')}</span>
                </span>
                <span className="pq-row-actions">
                  {b.paymentQrUrl ? (
                    <button type="button" className="pq-remove" disabled={!writable || busy !== null} onClick={() => void run(b.id, () => api.removeBranchPaymentQr(b.id))}>
                      {t('remove')}
                    </button>
                  ) : null}
                  <button type="button" className="pq-link" disabled={!writable || busy !== null} onClick={() => inputs.current[b.id]?.click()}>
                    {busy === b.id ? t('uploading') : b.paymentQrUrl ? t('change') : t('addOwn')}
                  </button>
                  {picker(b.id, (file) => api.uploadBranchPaymentQr(b.id, file))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
