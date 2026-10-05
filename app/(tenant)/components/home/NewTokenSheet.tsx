'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '../../lib/api';
import { toStoredPhone } from '../../lib/phone';
import { useNewVisitCopy } from '../../lib/use-copy';
import { usePhoneProblem } from '../../lib/use-phone-problem';
import { useDialog } from '../../../shared/a11y/useDialog';
import { PhoneField } from '../PhoneField';
import { IconCheck, IconClose } from '../icons';
import type { TokenWords } from './token-words';
import { announceVisitChanged } from '../../lib/visit-changed';

/** One key per sheet, reused on every retry: a lost response and a second tap are one place in line (GRW-204). */
function newAttemptKey(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Jira GRW-404 (epic GRW-283) — New token: a name, a phone if they give one, and the number to tell them.
 *
 * The epic's first step — "[+ New token] → name (phone optional) → Token #14" — and nothing else. No services (they
 * are picked at payment, GRW-284), no stylist (optional, and chosen when somebody takes them), and never a refusal
 * because nobody is free: a token is a place in line, not a chair (BR-01).
 *
 * A phone number is matched to a client on file when the visit is recorded, not here: nobody gets a client record
 * just for waiting (GRW-222).
 */
export function NewTokenSheet({
  w,
  location,
  branchName,
  onClose,
}: {
  w: TokenWords;
  /** The branch the token is for — the dashboard's branch. A pinned front desk's is theirs whatever is sent. */
  location: string | null;
  /** Said on the sheet when the business has more than one branch, so an owner knows which line they add to. */
  branchName: string | null;
  onClose: () => void;
}) {
  const nv = useNewVisitCopy();
  const tcm = useTranslations('common');
  const checkPhone = usePhoneProblem();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [attemptKey, setAttemptKey] = useState(newAttemptKey);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<{ tokenNo: number | null; name: string } | null>(null);
  useDialog(ref, { onClose: saving ? undefined : onClose });

  const give = async () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    const problem = checkPhone(phone, { required: false });
    if (problem) {
      setPhoneError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const stored = toStoredPhone(phone);
      const entry = await api.addToQueue({
        customerName: name.trim(),
        ...(stored ? { customerPhone: stored } : {}),
        serviceIds: [],
        idempotencyKey: attemptKey,
        ...(location ? { location } : {}),
      });
      router.refresh();
      announceVisitChanged();
      setIssued({ tokenNo: entry.tokenNo, name: entry.customerName });
    } catch (e) {
      // Only the API's own sentence; a dropped connection may still have saved, and the same key makes a retry safe.
      setError(e instanceof ApiError ? e.message : nv.saveUnknown);
    } finally {
      setSaving(false);
    }
  };

  const another = () => {
    setIssued(null);
    setName('');
    setPhone('');
    setAttemptKey(newAttemptKey());
  };

  return (
    <div className="hm-overlay" role="presentation" onClick={saving ? undefined : onClose}>
      <div className="hm-sheet hm-sheet-narrow tb-new" role="dialog" aria-modal="true" aria-labelledby="tb-new-title" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="hm-sheet-head">
          <div>
            <h2 id="tb-new-title">{w.newToken}</h2>
            <p>{branchName ? w.atBranch(branchName) : w.newTokenSub}</p>
          </div>
          <button type="button" className="hm-icon-btn" aria-label={nv.close} onClick={onClose} disabled={saving}>
            <IconClose />
          </button>
        </div>

        {issued ? (
          <div className="tb-issued" role="status">
            <IconCheck />
            <strong className="tb-issued-no">{issued.tokenNo ? w.tokenIssued(issued.tokenNo) : nv.queued}</strong>
            <span>{w.tellThem(issued.name)}</span>
            <div className="tb-new-actions">
              <button type="button" className="hm-btn hm-btn-quiet" onClick={another}>
                {w.anotherToken}
              </button>
              <button type="button" className="btn" onClick={onClose}>
                {nv.done}
              </button>
            </div>
          </div>
        ) : (
          <form
            className="tb-new-form"
            onSubmit={(e) => {
              e.preventDefault();
              void give();
            }}
          >
            {error ? (
              <div className="hm-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="tb-new-name">{nv.nameRequired}</label>
              <input
                id="tb-new-name"
                type="text"
                autoFocus
                autoComplete="off"
                className={nameError ? 'field-invalid' : undefined}
                aria-invalid={nameError}
                value={name}
                placeholder={nv.namePlaceholder}
                maxLength={80}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(false);
                }}
              />
              {nameError ? (
                <div role="alert" className="field-error">
                  {nv.nameMissing}
                </div>
              ) : null}
            </div>
            <PhoneField
              id="tb-new-phone"
              label={nv.phoneRequired}
              optionalLabel={tcm('optional')}
              value={phone}
              onChange={(v) => {
                setPhone(v);
                if (phoneError) setPhoneError(null);
              }}
              error={phoneError}
              hint={nv.phoneWhy}
            />
            {branchName ? <p className="tb-new-note">{w.newTokenSub}</p> : null}
            <div className="tb-new-actions">
              <button type="button" className="hm-btn hm-btn-quiet" onClick={onClose} disabled={saving}>
                {tcm('cancel')}
              </button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? w.giving : w.giveToken}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
