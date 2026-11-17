'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { FREE_REASON_MAX } from './bill-discount';

/**
 * Jira GRW-725 — owner decision 2026-11-17: beside the discount, on a bill it takes to ₹0.
 *
 * For anyone but the owner, the plain sentence: only the owner can give the whole bill free (Pay stays shut beside
 * it). For the owner, the Reason the bill will keep — required, 3 to 200 letters, a 44px field. One component for
 * both tills (the till's payment step and the Queue's payment), so they cannot say it two ways.
 */
export function FreeBillReason({
  block,
  reason,
  onReason,
  disabled,
}: {
  /** `freeBillBlock`'s answer for a bill that IS free: who may not, or what is still missing (null once it is said). */
  block: 'ownerOnly' | 'needsReason' | null;
  reason: string;
  onReason: (reason: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('payFlow.discount');
  const hintId = useId();
  if (block === 'ownerOnly') {
    return (
      <p className="pf-free-owner-only" role="alert">
        {t('ownerOnly')}
      </p>
    );
  }
  return (
    <label className="pf-free-reason">
      <span className="pf-free-reason-label">{t('reasonLabel')}</span>
      <input
        type="text"
        value={reason}
        maxLength={FREE_REASON_MAX}
        autoComplete="off"
        required
        // Red once something too short is typed, not before the owner has started (QA 2026-11-17).
        aria-invalid={block === 'needsReason' && reason.trim().length > 0}
        aria-describedby={hintId}
        onChange={(e) => onReason(e.target.value)}
        disabled={disabled}
      />
      <span id={hintId} className="pf-free-reason-hint">
        {t('reasonHint')}
      </span>
    </label>
  );
}
