'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useDialog } from '../../../shared/a11y/useDialog';

/**
 * An in-page number pad, so a figure can be typed without the phone's own keyboard.
 *
 * Owner, 2026-10-09 — Record payment is redesigned for an owner who does not read well. The one thing everyone
 * reads is a number, and the one keyboard everyone can use is the ten-digit one every UPI app and Khatabook draw
 * on the page itself: twelve keys of 64px, not a 40-key QWERTY sliding up over half the screen. `Keys` is the pad
 * alone, shared by the total (`Keypad`) and the client's number (`ClientSheet`).
 */
export function Keys({ onDigit, onBackspace, onDone, doneDisabled = false }: { onDigit: (d: string) => void; onBackspace: () => void; onDone: () => void; doneDisabled?: boolean }) {
  const t = useTranslations('payFlow');
  return (
    <div className="pf-keys">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
        <button key={k} type="button" className="pf-key" onClick={() => onDigit(k)}>
          {k}
        </button>
      ))}
      <button type="button" className="pf-key pf-key-quiet" aria-label={t('backspace')} onClick={onBackspace}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
          <path d="m18 9-6 6M12 9l6 6" />
        </svg>
      </button>
      <button type="button" className="pf-key" onClick={() => onDigit('0')}>
        0
      </button>
      <button type="button" className="pf-key pf-key-go" aria-label={t('keypadDone')} onClick={onDone} disabled={doneDisabled}>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </button>
    </div>
  );
}

/** Physical keys for a desk with a keyboard attached: the same digits, Backspace, Enter. */
export function useTypedDigits(onDigit: (d: string) => void, onBackspace: () => void, onDone: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // Not while a real field has focus (the name on the client sheet): that keyboard is its own.
      const at = document.activeElement;
      if (at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) onDigit(e.key);
      else if (e.key === 'Backspace') onBackspace();
      else if (e.key === 'Enter') onDone();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDigit, onBackspace, onDone, active]);
}

/** One more digit, or the same value when there is no room: a leading zero never starts a figure. */
export function pushDigit(value: string, digit: string, max: number, leadingZero = false): string {
  if (!leadingZero && value === '' && digit === '0') return value;
  if (value.length >= max) return value;
  return value + digit;
}

/** The total, changed: a discount or a price of the owner's own. Rupees only, no paise — a counter does not take them. */
export function Keypad({
  title,
  value,
  hint,
  onChange,
  onDone,
  onClose,
}: {
  title: string;
  /** Whole rupees as typed, '' for nothing yet. */
  value: string;
  /** Under the figure: the list price it started from. */
  hint: string | null;
  onChange: (next: string) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('payFlow');
  const ref = useRef<HTMLDivElement>(null);
  // A dialog over the tiles: focus in, Tab kept inside, Escape closes. No field in it, so no keyboard can follow.
  useDialog(ref, { onClose, initialFocus: 'container' });
  // Seven digits is ₹99,99,999 — more than any one bill.
  useTypedDigits(
    (d) => onChange(pushDigit(value, d, 7)),
    () => onChange(value.slice(0, -1)),
    onDone,
  );

  // A tap on the dimmed area closes it, as every other sheet in the app does (`sheet-backdrop`).
  return (
    <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pf-keypad" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{title}</span>
          <button type="button" className="pf-keypad-clear" onClick={() => onChange('')}>
            {t('keypadClear')}
          </button>
        </div>
        <output className="pf-keypad-figure" aria-live="polite">
          <span aria-hidden="true">₹</span>
          {value === '' ? '0' : Number(value).toLocaleString('en-IN')}
        </output>
        {hint ? <p className="pf-keypad-hint">{hint}</p> : null}
        <Keys onDigit={(d) => onChange(pushDigit(value, d, 7))} onBackspace={() => onChange(value.slice(0, -1))} onDone={onDone} />
      </div>
    </div>
  );
}
