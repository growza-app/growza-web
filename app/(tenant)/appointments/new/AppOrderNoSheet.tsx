'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useNewVisitCopy } from '../../lib/use-copy';
import { useDialog } from '../../../shared/a11y/useDialog';
import { useScrimDismiss } from '../../../shared/a11y/scrim-dismiss';

/**
 * Owner, 2026-10-24 — the delivery app's own order number (Swiggy, Zomato), typed off the app's tablet.
 *
 * A sheet of its own, like the guest's name: the till itself has no text field, so no keyboard ever comes up on it
 * by itself (`pay-flow.test.ts`). Optional — the order is kept without one — but with it the same order cannot be rung
 * up twice, and the bill can be matched to the app's payout later.
 */
export function AppOrderNoSheet({ app, value, onDone, onClose }: { app: string; value: string; onDone: (orderNo: string) => void; onClose: () => void }) {
  const t = useTranslations('payFlow.from');
  const nv = useNewVisitCopy();
  const ref = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });
  // Tapping "add the order number" IS asking for the keyboard, so the box takes focus.
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);
  const [typed, setTyped] = useState(value);
  const done = () => onDone(typed.trim());

  // A tap beside the card closes it and presses nothing underneath (owner, 2026-10-28).
  const scrimDismiss = useScrimDismiss(onClose);
  return (
    <div className="pf-keypad-scrim" {...scrimDismiss}>
      <div ref={ref} className="pf-keypad pf-client" role="dialog" aria-modal="true" aria-label={t('orderNo', { app })} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('orderNo', { app })}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {nv.close}
          </button>
        </div>
        <form
          className="pf-client-add-row"
          onSubmit={(e) => {
            e.preventDefault();
            done();
          }}
        >
          <div className="field">
            <label htmlFor="pf-app-order-no">
              {t('orderNo', { app })} <span className="pf-from-optional">{t('optional')}</span>
            </label>
            <input id="pf-app-order-no" ref={box} type="text" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={100} autoComplete="off" autoCorrect="off" spellCheck={false} />
          </div>
          <button type="submit" className="btn btn-primary">
            {t('save')}
          </button>
        </form>
      </div>
    </div>
  );
}
