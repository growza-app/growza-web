'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNewVisitCopy } from '../lib/use-copy';
import { usePhoneProblem } from '../lib/use-phone-problem';
import { displayPhone, fromStoredPhone, toStoredPhone } from '../lib/phone';
import { rowsToText, whatsappHref, type ReceiptRow } from '../lib/receipt-text';
import { dialable } from './BookingSheet';
import { PhoneField } from './PhoneField';
import { IconPrint, IconShare, IconWhatsApp } from './icons';

/** One row of the bill as WhatsApp will draw it: the same segments the text is written from. */
function Row({ row }: { row: ReceiptRow }) {
  if (row.length === 0) return <div className="wi-receipt-gap" />;
  return (
    <div>
      {row.map((seg, i) =>
        seg.bold ? (
          <strong key={i}>{seg.t}</strong>
        ) : seg.italic ? (
          <em key={i}>{seg.t}</em>
        ) : (
          <span key={i}>{seg.t}</span>
        ),
      )}
    </div>
  );
}

/**
 * The bill, after Mark done, and the ways to hand it to the client (owner, 2026-10-07 — the design's "Mobile · 2").
 *
 * Send on WhatsApp opens a `wa.me` link with the bill typed out, in the salon's own WhatsApp, and the desk presses
 * send: no WhatsApp API, nothing sent by Growza. The number starts as the client's own; Change sends this one bill
 * somewhere else (a parent's phone) without touching the client's record. Share hands the same text to any app on a
 * phone; Print prints the bill alone, which is also how it becomes a PDF (the print dialog's Save as PDF).
 */
export function ReceiptShare({
  bill,
  phone,
  kind = 'bill',
  onNumberGiven,
  compactPreview = false,
}: {
  bill: ReceiptRow[];
  phone: string | null;
  /**
   * Which message this is (owner, 2026-10-07). The same screen hands over a bill after a payment and a
   * confirmation after a booking; only the words around it change, because everything else — the number, the
   * `wa.me` link, Share, Print — is the same act.
   */
  kind?: 'bill' | 'confirm';
  /**
   * A number typed here, for a visit that had nobody on it (owner, 2026-10-10).
   *
   * Called with the stored number when Send is pressed, so the screen above can keep the person as a client. Only
   * ever passed when `phone` is null: a Change on a client's own bill sends THIS bill somewhere else — a parent's
   * phone — and must not touch their record, which is the rule this component already held.
   */
  onNumberGiven?: (storedPhone: string) => void;
  /**
   * Cap the bill's height and let it scroll (owner, 2026-10-10).
   *
   * Full height everywhere it has always been full height. The three-tap done screen caps it: 284px of paper
   * pushed Next customer — the button pressed after every single sale — off the bottom of the screen. Capped,
   * the bill is still THERE, still read without a tap, and the rest of the screen fits above the fold.
   */
  compactPreview?: boolean;
}) {
  const text = useMemo(() => rowsToText(bill), [bill]);
  const nv = useNewVisitCopy();
  const words =
    kind === 'bill'
      ? { preview: nv.billPreview, send: nv.sendOnWhatsapp, hint: nv.sendHint, share: nv.shareBill }
      : { preview: nv.confirmPreview, send: nv.sendConfirm, hint: nv.confirmHint, share: nv.shareConfirm };
  /*
   * Only a bill prints (owner, 2026-10-07).
   *
   * Print is on the receipt because a salon is sometimes asked for one on paper, and because the print dialog's
   * "Save as PDF" is how that receipt becomes a file. A booking confirmation is neither: nobody hands a client a
   * printed sheet saying they are seventh in the queue, and the message is going to their phone anyway.
   */
  const canPrint = kind === 'bill';
  const checkPhone = usePhoneProblem();
  const [editing, setEditing] = useState(!phone);
  const [typed, setTyped] = useState(fromStoredPhone(phone));
  const [touched, setTouched] = useState(false);
  /*
   * Share is a phone's: a touch screen whose browser can hand text to another app. Desktop Safari and Edge have
   * `navigator.share` too, and there it opens an OS panel beside the Send on WhatsApp right above it. Asked after
   * mount, so the server's HTML matches; `mounted` also gates the print copy's portal (a portal is a child position
   * the server never wrote — see BottomNav's scrim).
   */
  const [mounted, setMounted] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setMounted(true);
    setCanShare(typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches);
  }, []);
  const backToTheirs = () => {
    setTyped(fromStoredPhone(phone));
    setTouched(false);
    setEditing(false);
  };

  const problem = checkPhone(typed, { required: true });
  const digits = problem ? '' : dialable(toStoredPhone(typed));
  const shownProblem = touched ? problem : null;

  return (
    <section className="wi-receipt-share" aria-label={words.preview}>
      <h2 className="wi-section-label">{words.preview}</h2>
      {/* `tabIndex` when it scrolls: a scrollable region a mouse can reach has to be reachable by keyboard too. */}
      <div className={`wi-receipt-paper ${compactPreview ? 'wi-receipt-paper-short' : ''}`} tabIndex={compactPreview ? 0 : undefined} role={compactPreview ? 'group' : undefined}>
        {bill.map((row, i) => (
          <Row key={i} row={row} />
        ))}
      </div>
      {/*
        What Print prints: a copy of the bill as a direct child of <body>, so the print stylesheet can take every
        other child out of the page (`display: none`) rather than hide it — hidden content keeps its height, and a
        long page printed as one bill and several blank sheets.
      */}
      {mounted && canPrint
        ? createPortal(
            <div className="wi-receipt-print" aria-hidden="true">
              {bill.map((row, i) => (
                <Row key={i} row={row} />
              ))}
            </div>,
            document.body,
          )
        : null}

      {editing ? (
        <>
          <PhoneField
            id="wi-receipt-phone"
            label={nv.clientWhatsapp}
            required
            value={typed}
            onChange={(v) => {
              setTyped(v);
              setTouched(true);
            }}
            error={shownProblem}
          />
          {/* Change pressed by mistake, or a digit lost: back to the client's own number in one tap. */}
          {phone ? (
            <button type="button" className="btn btn-ghost wi-receipt-change wi-receipt-back" onClick={backToTheirs}>
              {nv.useClientNumber(displayPhone(phone))}
            </button>
          ) : null}
        </>
      ) : (
        <div className="wi-receipt-to">
          <span className="wi-receipt-to-label">{nv.sendingTo}</span>
          <span className="wi-receipt-to-number">{displayPhone(phone)}</span>
          <button type="button" className="btn btn-ghost wi-receipt-change" onClick={() => setEditing(true)}>
            {nv.changeNumber}
          </button>
        </div>
      )}

      {digits ? (
        <a
          className="btn wi-receipt-send"
          href={whatsappHref(digits, text)}
          target="_blank"
          rel="noopener noreferrer"
          /*
           * Pressing Send is when a typed number becomes real: the client asked for their bill on it. Fired
           * alongside the link rather than before it — WhatsApp opens in its own tab either way, and keeping a
           * client must never be something the bill waits on.
           */
          onClick={() => {
            if (onNumberGiven && !phone) onNumberGiven(toStoredPhone(typed)!);
          }}
        >
          <IconWhatsApp />
          {words.send}
        </a>
      ) : (
        // No usable number yet: the button says what it will do, and pressing it says what is missing.
        <button
          type="button"
          className="btn wi-receipt-send"
          onClick={() => setTouched(true)}
          aria-describedby="wi-receipt-phone"
        >
          <IconWhatsApp />
          {words.send}
        </button>
      )}
      <p className="wi-receipt-hint">{words.hint}</p>

      {canShare || canPrint ? (
        <div className="wi-receipt-more">
          {canShare ? (
            <button
              type="button"
              className="btn btn-ghost wi-act-alt"
              onClick={() => void navigator.share({ text }).catch(() => undefined)}
            >
              <IconShare />
              {words.share}
            </button>
          ) : null}
          {canPrint ? (
            <button type="button" className="btn btn-ghost wi-act-alt" onClick={() => window.print()}>
              <IconPrint />
              {nv.printBill}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
