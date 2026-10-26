'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLabel } from './LabelsProvider';
import { useNewVisitCopy } from '../lib/use-copy';
import { usePhoneProblem } from '../lib/use-phone-problem';
import { displayPhone, fromStoredPhone, toStoredPhone } from '../lib/phone';
import {
  formatStructuredWhatsappText,
  parseReceiptCard,
  renderReceiptCardBlob,
  rowsToText,
  whatsappHref,
  type ReceiptRow,
} from '../lib/receipt-text';
import { waDigits } from './BookingSheet';
import { PhoneField } from './PhoneField';
import type { ReactNode } from 'react';
import { IconCheck, IconPrint, IconShare, IconWhatsApp } from './icons';

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
  afterSend,
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
  /**
   * Something that belongs with the receipt but is not the receipt — drawn directly under Send on WhatsApp and above
   * Print/Share (Jira GRW-582: the customer's tax invoice). A slot rather than a second component of its own, so the
   * desk's one column of "things you hand the customer" stays one column, in one order, above the fold.
   */
  afterSend?: ReactNode;
}) {
  const text = useMemo(() => (kind === 'bill' ? formatStructuredWhatsappText(bill) : rowsToText(bill)), [bill, kind]);
  const card = useMemo(() => (kind === 'bill' ? parseReceiptCard(bill) : null), [bill, kind]);
  const hasGraphicCard = Boolean(card && (card.items.length > 0 || card.totalAmount));
  const nv = useNewVisitCopy();
  // The vertical's own word for the person paying: Guest to a restaurant, Customer to a shop, Client to a salon.
  const clientNoun = useLabel('customer', 'Client');
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
  const [copiedKind, setCopiedKind] = useState<'card' | 'text' | null>(null);
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

  const copyCardToClipboard = async () => {
    if (!card) return;
    try {
      const blob = await renderReceiptCardBlob(card);
      if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopiedKind('card');
        window.setTimeout(() => setCopiedKind((prev) => (prev === 'card' ? null : prev)), 3000);
        return;
      }
      if (blob && typeof navigator.share === 'function') {
        const file = new File([blob], 'receipt.png', { type: 'image/png' });
        await navigator.share({ files: [file], text });
        return;
      }
    } catch {
      // Fallback to copying structured text if the browser blocks image clipboard write
    }
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedKind('text');
      window.setTimeout(() => setCopiedKind((prev) => (prev === 'text' ? null : prev)), 3000);
    } catch {
      /* ignore */
    }
  };

  const copyTextToClipboard = async () => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedKind('text');
      window.setTimeout(() => setCopiedKind((prev) => (prev === 'text' ? null : prev)), 3000);
    } catch {
      /* ignore */
    }
  };

  const shareReceipt = async () => {
    if (hasGraphicCard && card) {
      try {
        const blob = await renderReceiptCardBlob(card);
        if (blob) {
          const file = new File([blob], 'receipt.png', { type: 'image/png' });
          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text });
            return;
          }
        }
      } catch {
        /* fallback to text share */
      }
    }
    await navigator.share({ text }).catch(() => undefined);
  };

  const problem = checkPhone(typed, { required: true });
  const digits = problem ? '' : waDigits(toStoredPhone(typed));
  const shownProblem = touched ? problem : null;

  return (
    <section className="wi-receipt-share" aria-label={words.preview}>
      <h2 className="wi-section-label">{words.preview}</h2>
      {/* `tabIndex` when it scrolls: a scrollable region a mouse can reach has to be reachable by keyboard too. */}
      <div className={`wi-receipt-paper ${compactPreview ? 'wi-receipt-paper-short' : ''}${hasGraphicCard ? ' is-graphic-card' : ''}`} tabIndex={compactPreview ? 0 : undefined} role={compactPreview ? 'group' : undefined}>
        {hasGraphicCard && card ? (
          <div className="wi-rc-card">
            <div className="wi-rc-header">
              <div className="wi-rc-brand">
                <span className="wi-rc-logo" aria-hidden="true">
                  {(card.businessName.trim()[0] ?? 'G').toUpperCase()}
                </span>
                <div className="wi-rc-brand-text">
                  <strong className="wi-rc-biz">{card.businessName}</strong>
                  <span className="wi-rc-sub">
                    {[card.branchName, card.title].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
              {card.tokenLabel ? (
                <div className="wi-rc-token-box">
                  <span className="wi-rc-token-lbl">{nv.rcTokenLabel}</span>
                  <strong className="wi-rc-token-num">{card.tokenLabel}</strong>
                </div>
              ) : null}
            </div>

            <div className="wi-rc-meta">
              <span>{card.when ?? card.title}</span>
              <span className="wi-rc-chan-pill">{card.stylist ?? nv.rcVerified}</span>
            </div>

            <div className="wi-rc-body">
              <div className="wi-rc-sec-head">
                <span>{card.isOrder ? nv.rcYourOrder(card.totalItemsCount) : card.itemsHeading}</span>
                <span>{nv.rcAmount}</span>
              </div>
              <ul className="wi-rc-items">
                {card.items.map((it, idx) => (
                  <li key={idx} className="wi-rc-item">
                    <div className="wi-rc-item-row">
                      <div className="wi-rc-item-left">
                        {card.isOrder || it.qty > 1 ? <span className="wi-rc-qty">{it.qty}×</span> : null}
                        <span className="wi-rc-name">{it.name}</span>
                      </div>
                      <span className="wi-rc-amt">{it.amount}</span>
                    </div>
                    {it.details.map((d, di) => (
                      <div key={di} className="wi-rc-item-detail">
                        {d}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>

              <div className="wi-rc-totals">
                {card.adjustments.map((adj, ai) => (
                  <div key={ai} className={`wi-rc-adj${adj.isDiscount ? ' is-discount' : ''}`}>
                    <span>{adj.label}</span>
                    <span>{adj.amount}</span>
                  </div>
                ))}
                {card.savedLine ? (
                  <div className="wi-rc-adj is-discount">
                    <span>★ {card.savedLine}</span>
                  </div>
                ) : null}
                <div className="wi-rc-total-bar">
                  <div className="wi-rc-total-left">
                    <span className="wi-rc-total-lbl">{card.totalLabel}</span>
                    {card.paidBy ? <span className="wi-rc-paid-by">✓ {card.paidBy}</span> : null}
                  </div>
                  <strong className="wi-rc-total-val">{card.totalAmount}</strong>
                </div>
              </div>
            </div>

            {card.rewardsEarned || card.rewardsBalance ? (
              <div className="wi-rc-rewards">
                <div className="wi-rc-rewards-left">
                  <span className="wi-rc-star" aria-hidden="true">★</span>
                  <div>
                    <strong className="wi-rc-rewards-title">{card.rewardsEarned}</strong>
                    <span className="wi-rc-rewards-sub">{nv.rcRewardSub}</span>
                  </div>
                </div>
                {card.rewardsBalance ? (
                  <div className="wi-rc-rewards-bal">
                    <span className="wi-rc-rewards-bal-lbl">{nv.rcRewardBalance}</span>
                    <strong className="wi-rc-rewards-bal-val">{card.rewardsBalance}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}

            {card.googleReviewUrl ? (
              <div className="wi-rc-footer">
                ★ {card.reviewPrompt ?? nv.receiptReviewPrompt}: {card.googleReviewUrl}
              </div>
            ) : null}

            {card.thanks || card.seeYou ? (
              <div className="wi-rc-footer">
                {[card.thanks, card.seeYou].filter(Boolean).join(' ')}
              </div>
            ) : null}
          </div>
        ) : (
          bill.map((row, i) => <Row key={i} row={row} />)
        )}
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
            label={nv.clientWhatsapp(clientNoun)}
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
            if (hasGraphicCard) void copyCardToClipboard();
          }}
        >
          <IconWhatsApp />
          {words.send}
        </a>
      ) : (
        // No usable number yet: keep the Send on WhatsApp button disabled until a valid number is entered.
        <button
          type="button"
          className="btn wi-receipt-send"
          disabled
          aria-describedby="wi-receipt-phone"
        >
          <IconWhatsApp />
          {words.send}
        </button>
      )}
      <p className="wi-receipt-hint">{words.hint}</p>
      {afterSend}

      {canShare || canPrint ? (
        <div className="wi-receipt-more">
          {hasGraphicCard ? (
            <button
              type="button"
              className="btn btn-ghost wi-act-alt"
              onClick={() => void copyCardToClipboard()}
            >
              {copiedKind === 'card' ? <IconCheck /> : <IconShare />}
              {copiedKind === 'card' ? nv.cardCopied : nv.copyCard}
            </button>
          ) : null}
          {canPrint ? (
            <button
              type="button"
              className="btn btn-ghost wi-act-alt"
              onClick={() => void copyTextToClipboard()}
            >
              <IconCheck />
              {copiedKind === 'text' ? nv.textCopied : nv.copyText}
            </button>
          ) : null}
          {canShare ? (
            <button
              type="button"
              className="btn btn-ghost wi-act-alt"
              onClick={() => void shareReceipt()}
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
