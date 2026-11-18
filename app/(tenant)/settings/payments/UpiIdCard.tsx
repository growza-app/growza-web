'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, type PaymentQrState } from '../../lib/api';
import { useSession, useWritable } from '../../components/SessionProvider';

/** Jira GRW-729 BR-02 — `name@bank`, the same shape the API checks; whether the ID exists is the bank's to say. */
export function isUpiId(raw: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63}$/i.test(raw.trim());
}

const PAYEE_MAX = 50;

/**
 * Jira GRW-729 — the business's UPI ID, so every printed bill carries a QR for its own exact amount.
 *
 * The QR picture above is a QR for "pay this shop": the guest types the amount, and can type the wrong one. A UPI ID
 * lets the bill print a QR for "pay this shop ₹540 for bill SG/0042", which every UPI app opens filled in. The owner
 * alone changes it — it decides whose account a guest's money lands in.
 */
export function UpiIdCard({ state, onChange }: { state: PaymentQrState; onChange: (next: PaymentQrState) => void }) {
  const t = useTranslations('settingsPayments.upi');
  const session = useSession();
  const mayChange = useWritable() && (session?.role ?? 'owner') === 'owner';
  const [vpa, setVpa] = useState(state.upi?.vpa ?? '');
  const [payee, setPayee] = useState(state.upi?.payee ?? '');
  const [error, setError] = useState<{ field: 'vpa' | 'payee' | null; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = vpa.trim() !== (state.upi?.vpa ?? '') || payee.trim() !== (state.upi?.payee ?? '');

  const save = async (clear = false) => {
    setSaved(false);
    if (!clear && vpa.trim() && !isUpiId(vpa)) {
      setError({ field: 'vpa', message: t('invalid') });
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const next = await api.saveUpiId(clear ? { vpa: '', payee: '' } : { vpa: vpa.trim(), payee: payee.trim() });
      onChange(next);
      setVpa(next.upi?.vpa ?? '');
      setPayee(next.upi?.payee ?? '');
      setSaved(true);
    } catch (e) {
      const field = e instanceof ApiError && e.status < 500 ? (e.field === 'payee' ? 'payee' : 'vpa') : null;
      setError({ field, message: e instanceof ApiError && e.status < 500 ? e.message : t('failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card pq-card" aria-labelledby="pq-upi-title">
      <div>
        <h2 className="pq-title" id="pq-upi-title">
          {t('title')}
        </h2>
        <p className="pq-sub">{state.upi ? t('subOn') : t('subOff')}</p>
      </div>
      {mayChange ? (
        <form
          className="pq-upi"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="field">
            <label htmlFor="pq-upi-vpa">{t('vpa')}</label>
            <input
              id="pq-upi-vpa"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('example')}
              value={vpa}
              maxLength={300}
              onChange={(e) => {
                setVpa(e.target.value);
                setSaved(false);
                if (error?.field === 'vpa') setError(null);
              }}
              aria-invalid={error?.field === 'vpa' || undefined}
              aria-describedby={error?.field === 'vpa' ? 'pq-upi-error' : undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="pq-upi-payee">{t('payee')}</label>
            <input
              id="pq-upi-payee"
              type="text"
              value={payee}
              maxLength={PAYEE_MAX}
              onChange={(e) => {
                setPayee(e.target.value);
                setSaved(false);
                if (error?.field === 'payee') setError(null);
              }}
              aria-invalid={error?.field === 'payee' || undefined}
              aria-describedby={error?.field === 'payee' ? 'pq-upi-error' : 'pq-upi-payee-hint'}
            />
            <div className="field-hint" id="pq-upi-payee-hint">
              {t('payeeHint')}
            </div>
          </div>
          {error ? (
            <div role="alert" className="field-error" id="pq-upi-error">
              {error.message}
            </div>
          ) : saved ? (
            <div role="status" className="pq-upi-saved">
              {t('saved')}
            </div>
          ) : null}
          <div className="pq-actions">
            <button type="submit" className="btn pq-btn" disabled={busy || !dirty}>
              {busy ? t('saving') : t('save')}
            </button>
            {state.upi ? (
              <button type="button" className="pq-remove" disabled={busy} onClick={() => void save(true)}>
                {t('remove')}
              </button>
            ) : null}
          </div>
        </form>
      ) : state.upi ? (
        <p className="pq-upi-shown">
          <span>{state.upi.vpa}</span> · <span>{state.upi.payee}</span>
        </p>
      ) : null}
    </section>
  );
}
