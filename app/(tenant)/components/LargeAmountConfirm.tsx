'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';

/** Jira GRW-480 (S-18c) — the person at the till chose not to save an unusually large amount. Not an error to show. */
export class LargeAmountDeclined extends Error {
  constructor() {
    super('large amount declined');
    this.name = 'LargeAmountDeclined';
  }
}

/**
 * Jira GRW-480 (S-18c) — "That is a lot. Save it anyway?"
 *
 * The API refuses a till amount far beyond the bill with 409 `amount_unusually_large` until it is sent again with
 * `confirmLargeAmount: true`. `guard(send)` sends, asks on that refusal, and sends again if the person confirms;
 * `dialog` is rendered by the screen. A typo of two extra zeros used to be saved as takings on one tap.
 */
export function useLargeAmountGuard(): { guard: <T>(send: (confirmed: boolean) => Promise<T>) => Promise<T>; dialog: ReactNode } {
  const t = useTranslations('checkout');
  const [asking, setAsking] = useState<((ok: boolean) => void) | null>(null);

  const guard = async <T,>(send: (confirmed: boolean) => Promise<T>): Promise<T> => {
    try {
      return await send(false);
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'amount_unusually_large')) throw error;
      const ok = await new Promise<boolean>((resolve) => setAsking(() => resolve));
      setAsking(null);
      if (!ok) throw new LargeAmountDeclined();
      return send(true);
    }
  };

  const dialog = asking ? (
    <ConfirmDialog
      title={t('largeTitle')}
      body={t('largeBody')}
      confirmLabel={t('largeConfirm')}
      cancelLabel={t('largeCancel')}
      onConfirm={() => asking(true)}
      onCancel={() => asking(false)}
    />
  ) : null;

  return { guard, dialog };
}
