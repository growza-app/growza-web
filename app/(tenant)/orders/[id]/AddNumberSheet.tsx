'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useNouns } from '../../lib/use-nouns';
import { api, ApiError } from '../../lib/api';
import { toStoredPhone } from '../../lib/phone';
import { usePhoneProblem } from '../../lib/use-phone-problem';
import { PhoneField } from '../../components/PhoneField';
import { useDialog } from '../../../shared/a11y/useDialog';
import { useScrimDismiss } from '../../../shared/a11y/scrim-dismiss';

const PHONE_ID = 'ord-add-number';
const NAME_ID = 'ord-add-number-name';

/**
 * Jira GRW-747 (FR-04) — "Add guest's number": a counter order kept under a name alone ("Rahul") becomes that guest's
 * visit once they give a number. Found by it if they are already in the list, or added under the name the order kept.
 *
 * The number only, not a second name field, when the order already says who it was for: that is the name a new guest is
 * saved under. A Walk-in order (paid with nobody named) says nobody, so it gets an optional name box above the number —
 * otherwise the guest is saved with no name at all. Once, too — the server answers a second try with the same number as done, and refuses a different one.
 */
export function AddNumberSheet({
  orderId,
  name,
  onClose,
  onAdded,
}: {
  orderId: string;
  /** The name the order was kept under, shown so the desk knows whose number this is. */
  name: string | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const nouns = useNouns();
  const checkPhone = usePhoneProblem();
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose });

  const [phone, setPhone] = useState('');
  // Only asked when the order kept no name (a Walk-in order); 60 letters, as the API keeps a name on an order.
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = checkPhone(phone, { required: true });
  // As the till's own number box: nothing said under an untouched field, the countdown from the first digit.
  const shownProblem = phone.length > 0 ? problem : null;

  const save = async () => {
    const stored = toStoredPhone(phone);
    if (busy || problem !== null || !stored) return;
    setBusy(true);
    setError(null);
    try {
      const who = name ?? (typedName.trim() || null);
      await api.assignClientToSale(orderId, { phone: stored, ...(who ? { name: who } : {}) });
      onAdded();
    } catch (err) {
      // The API's own sentence ("already has a guest", "too late for the desk"), said where it happened.
      setError(err instanceof ApiError && err.status >= 400 && err.status < 500 ? err.message : t('addNumber.failed'));
      setBusy(false);
    }
  };

  const scrimDismiss = useScrimDismiss(onClose, !busy);
  return (
    <div className="pf-keypad-scrim" {...scrimDismiss}>
      <div ref={ref} className="pf-keypad psz-sheet atc-sheet" role="dialog" aria-modal="true" aria-label={t('addNumber.title', { customer: nouns.customer })} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('addNumber.title', { customer: nouns.customer })}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose} disabled={busy}>
            {t('attach.close')}
          </button>
        </div>

        {name ? (
          <p className="atc-buyer">
            <span className="atc-buyer-name">{name}</span>
          </p>
        ) : (
          <div className="field ord-add-number-name">
            <label htmlFor={NAME_ID}>
              {t('addNumber.nameLabel')}
              <span className="field-optional" aria-hidden="true">{tc('optional')}</span>
            </label>
            <input id={NAME_ID} type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)} maxLength={60} autoComplete="off" disabled={busy} />
          </div>
        )}

        <div onKeyDown={(e) => e.key === 'Enter' && void save()}>
          <PhoneField id={PHONE_ID} label={t('addNumber.label')} required value={phone} onChange={setPhone} error={shownProblem} disabled={busy} />
        </div>
        <p className="atc-note">{t('addNumber.hint', { customers: nouns.Customers })}</p>

        {error ? (
          <p className="atc-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="button" className="btn ord-add-number-save" onClick={() => void save()} disabled={busy || problem !== null}>
          {busy ? t('addNumber.saving') : t('addNumber.save')}
        </button>
      </div>
    </div>
  );
}
