'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import type { PaymentMode } from '../lib/api-types';
import type { ReceiptRow } from '../lib/receipt-text';
import { BUZZ, buzz, chime, remember, SOUND_KEY, soundIsOn } from '../lib/pay-feedback';
import { useNewVisitCopy } from '../lib/use-copy';
import { IconCheck } from './icons';
import { ReceiptShare } from './ReceiptShare';

/**
 * The words a payment is spoken as: whole rupees bare, anything else with its paise.
 *
 * Owner-app QA, 2026-10-10 — it was `Math.round(totalMinor / 100)`, so ₹649.50 was said as "650" while the screen
 * above it read ₹649.50.
 */
export function spokenAmount(totalMinor: number, locale: string): string {
  const whole = totalMinor % 100 === 0;
  return (totalMinor / 100).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/**
 * The screen after a payment is recorded — one screen, whichever form recorded it (owner, 2026-10-10).
 *
 * Record payment has two forms: the three-tap flow on a phone (`PayFlow`) and the one-page form (`NewVisitSheet`,
 * `?full=1` on a phone and every desk). They ended differently: the three-tap one said the amount out loud, chimed,
 * buzzed, offered Next customer and kept the client's number; the one-page form said "Paid" and offered Done. The
 * owner's rule is that there is no difference, so this is the three-tap flow's done screen, lifted out whole, and
 * both forms render it.
 *
 * The sound is the phone's own (Web Audio for the chime, the browser's speech for the words): free, nothing sent
 * anywhere, and only when the phone's setting is on — the same setting from either form.
 */
export function PaymentDone({
  appointmentId,
  totalMinor,
  mode,
  modeLabel,
  summary,
  bill,
  phone: givenPhone,
  onNextCustomer,
  onDone,
  sound: soundProp,
  onToggleSound,
}: {
  /** The sale, so a number typed on this screen can be kept as its client. */
  appointmentId: string;
  totalMinor: number;
  mode: PaymentMode;
  /** How `mode` reads in the current language ("Cash", "UPI"). */
  modeLabel: string;
  /** The line under the amount: token · mode · services · stylist. */
  summary: string;
  bill: ReceiptRow[];
  /** The client's number, when the sale has one. With none, the screen asks for it. */
  phone: string | null;
  onNextCustomer: () => void;
  onDone: () => void;
  /** Controlled by a form that also uses the setting itself (PayFlow's taps); otherwise this screen keeps it. */
  sound?: boolean;
  onToggleSound?: () => void;
}) {
  const t = useTranslations('payFlow');
  const nv = useNewVisitCopy();
  const locale = useLocale();
  const router = useRouter();

  const [ownSound, setOwnSound] = useState(true);
  useEffect(() => {
    if (soundProp === undefined) setOwnSound(soundIsOn());
  }, [soundProp]);
  const sound = soundProp ?? ownSound;
  const toggleSound =
    onToggleSound ??
    (() =>
      setOwnSound((on) => {
        remember(SOUND_KEY, on ? 'off' : 'on');
        return !on;
      }));

  // Said, chimed and felt, once, as the screen arrives. The sound box owners trust says the amount; so does this.
  // Read from storage here rather than from `sound`, which is still its default on the first render.
  // Once per sale, however often React mounts the screen (dev mode mounts it twice on purpose).
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (said.current === appointmentId) return;
    said.current = appointmentId;
    if (!(soundProp ?? soundIsOn())) return;
    buzz(BUZZ.done);
    chime();
    try {
      const u = new SpeechSynthesisUtterance(t('spoken', { amount: spokenAmount(totalMinor, locale), mode: modeLabel }));
      u.lang = locale === 'hi' ? 'hi-IN' : 'en-IN';
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.speak(u);
    } catch {
      /* no voices: the screen still says it */
    }
    // Once per sale: a re-render (a number kept, the sound toggled) must not say it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  /*
   * The sale keeps the person, not just the number (owner, 2026-10-10).
   *
   * A sale recorded with no number: the client has just asked for their bill on one, the one moment they WANT to
   * give it. Never in the bill's way — the `wa.me` tab is already opening when this runs, and a failure says so
   * quietly rather than taking the screen.
   */
  const [phone, setPhone] = useState(givenPhone);
  const [kept, setKept] = useState<'saving' | 'done' | 'failed' | null>(null);
  const keepClient = (typed: string) => {
    if (kept) return;
    setKept('saving');
    void api
      .assignClientToSale(appointmentId, { phone: typed })
      .then(() => {
        setKept('done');
        setPhone(typed);
        router.refresh();
      })
      .catch(() => setKept('failed'));
  };

  return (
    <div className="pf pf-done-page">
      <div className="pf-done">
        <span className="pf-done-check" aria-hidden="true">
          <IconCheck />
        </span>
        <h1 className="pf-done-title" aria-live="assertive">
          {t('doneTitle', { amount: formatMoney(String(totalMinor)) })}
        </h1>
        <p className="pf-done-sub">{summary}</p>
      </div>
      <ReceiptShare bill={bill} phone={phone} compactPreview onNumberGiven={givenPhone ? undefined : keepClient} />
      {kept ? (
        <p className={kept === 'failed' ? 'pf-error pf-kept' : 'pf-kept'} role="status">
          {kept === 'failed' ? t('clientNotKept') : kept === 'saving' ? t('keepingClient') : t('clientKept')}
        </p>
      ) : null}
      <div className="pf-done-actions">
        <button type="button" className="btn pf-go" onClick={onNextCustomer}>
          {t('nextCustomer')}
        </button>
        {/*
          Next customer is the button of the three that gets pressed after every sale, so it keeps the width.
          The other two go side by side: finishing for now, and the way back to a sale that went in wrong.
        */}
        <div className="pf-done-minor">
          <button type="button" className="btn btn-ghost pf-go-alt" onClick={onDone}>
            {nv.done}
          </button>
          <Link href="/appointments" className="btn btn-ghost pf-go-alt">
            {t('mistake')}
          </Link>
        </div>
        <button type="button" className="pf-sound" aria-pressed={sound} onClick={toggleSound}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H2v6h4l5 4z" />
            {sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /> : <path d="m23 9-6 6M17 9l6 6" />}
          </svg>
          {sound ? t('soundOn') : t('soundOff')}
        </button>
      </div>
    </div>
  );
}
