'use client';

import { WaiterContext } from './waiter';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '../../shared/AppLink';
import { api, ApiError, formatMoney, type Appointment, type OrderDetail } from '../lib/api';
import type { PaymentMode } from '../lib/api-types';
import { HeaderBranchPicker } from '../components/HeaderBranchPicker';
import { useBranch } from '../components/BranchProvider';
import { useLabel } from '../components/LabelsProvider';
import { PrinterButton, PrinterSheet, TillPrintActions, useTicketPrinter, type OrderRef } from '../components/TicketPrinter';
import type { KitchenSlips } from '../lib/api-types';
import { slipsOf } from '../lib/print/from-api';
import { PaymentDone } from '../components/PaymentDone';
import { DiscountSheet } from '../appointments/new/DiscountSheet';
import { FreeBillReason } from '../appointments/new/FreeBillReason';
import { freeBillBlock } from '../appointments/new/bill-discount';
import { RedeemRow } from '../components/RedeemRow';
import { useAreas, useSession } from '../components/SessionProvider';
import { hasOrderQueue } from '../lib/areas';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconCheck, IconArrowLeft, IconFlame, IconClose, IconPayCard, IconPayCash, IconPayOther, IconPayUpi, IconPlus, IconSearch } from '../components/icons';
import PickupCardEdit from './PickupCardEdit';
import { remember, SOUND_KEY, soundIsOn } from '../lib/pay-feedback';
import { ClientSheet, type PickedClient } from '../appointments/new/ClientSheet';
import { Keypad } from '../appointments/new/Keypad';
import { formatDate } from '../lib/format';
import { displayPhone } from '../lib/phone';
import { nounInSentence, pickNoun } from '../lib/nouns';
import { receiptRows, type ReceiptRow } from '../lib/receipt-text';
import { useNewVisitCopy } from '../lib/use-copy';
import { useRewardQuote } from '../lib/use-reward-quote';
import { useBillOffers } from '../lib/use-bill-offers';
import { CouponRow, OfferLines } from '../appointments/new/CouponRow';
import { SellProductClient } from '../products/sell/SellProductClient';
import { MenuKebab } from '../products/MenuKebab';
import { PosTypeBarContext, type PosTypeBar, type TillOrderType } from './pos-type-bar';
import { buildSaleRows, type SaleRow } from '../sales/SalesClient';
import { ReturnProductSheet } from '../sales/ReturnProductSheet';
import {
  buildDailyTokens,
  tokensStillOnTheBoard,
  formatTokenNo,
  posQueueStorageKey,
  returnLookbackFrom,
  type PosDailyToken,
  type PosMode,
  type PosTokenOverride,
  type PosTokenState,
} from './pos-helpers';
import { useNouns } from '../lib/use-nouns';
import { isDeliveryApp } from '../lib/order-channels';

const QUEUE_PAY_ICONS: Record<'cash' | 'upi' | 'card' | 'other', ReactNode> = {
  cash: <IconPayCash />,
  upi: <IconPayUpi />,
  card: <IconPayCard />,
  other: <IconPayOther />,
};

function isWalkInToken(tk: Pick<PosDailyToken, 'customerName' | 'customerPhone'>): boolean {
  return !tk.customerPhone && (!tk.customerName || tk.customerName.trim().toLowerCase() === 'walk-in');
}

/** A table's open bill, read as the order it is, in the shape the payment screen pays (no token number: it is a table). */
export function tableBillToken(o: OrderDetail, tableName: string): PosDailyToken {
  const lines = o.lines.filter((l) => !l.cancelReason && l.qty > l.returnedQty);
  const net = (l: OrderDetail['lines'][number]) => Number(l.paidMinor ?? 0) - Number(l.returnedMinor ?? 0);
  return {
    id: o.id,
    tokenNo: 0,
    tokenLabel: tableName,
    offlineToken: null,
    startAt: o.soldAt,
    customerId: o.client?.id ?? null,
    customerName: o.client?.name ?? '',
    customerPhone: null,
    channel: o.channel,
    paymentMode: null,
    paymentPending: true,
    totalMinor: lines.reduce((n, l) => n + net(l), 0),
    items: lines.map((l) => ({ name: l.name, qty: l.qty - l.returnedQty, paidMinor: net(l) })),
    itemsSummary: lines.map((l) => `${l.qty}× ${l.name}`).join(', '),
    state: 'preparing',
    handedOverAt: null,
    elapsedMin: 0,
  };
}

function QueueTokenPayScreen({
  token,
  paymentQr,
  saving,
  error,
  walkInGuestLabel,
  clientNoun,
  onOpenClientSheet,
  onBack,
  onSettle,
  onPrintAgain,
  byNameOnly = false,
  guestSkipped = false,
}: {
  token: PosDailyToken;
  paymentQr: string | null;
  saving: PaymentMode | null;
  error: string | null;
  walkInGuestLabel: string;
  clientNoun: string;
  onOpenClientSheet: (startAdding: boolean) => void;
  onBack: () => void;
  /** Owner, 2026-11-15 — `bill` is the discount the counter gave here, and its % when it gave one. */
  onSettle: (
    ways: Array<{ mode: PaymentMode; amountMinor: number }>,
    redeemPoints: number,
    /**
     * Jira GRW-725 — `reason`, the owner's, when the discount takes the whole order off. Jira GRW-735 — `couponCode` when a
     * coupon is kept (then `offMinor` is the coupon's amount, and no discount is sent: the two never stack).
     */
    bill: { offMinor: number; pct: number | null; reason?: string; couponCode?: string },
    /** A waiter's walk-in: the name typed here, put on the bill before it is paid. */
    guestName?: string,
  ) => void;
  /**
   * Owner, 17 Nov 2026 — a waiter paying a table: the same ways to pay, split and QR, but the guest is a name typed here
   * (their role cannot open the guest list) and there is no discount or points (owner decisions 2026-11-15/16).
   */
  byNameOnly?: boolean;
  /**
   * Owner, 2026-11-22 (Jira GRW-747) — "Who is paying?" was skipped in Pickup: the order is paid as the branch's Walk-in,
   * so the ways to pay, the discount and a coupon are offered with nobody named. A kitchen's Pickup only.
   */
  guestSkipped?: boolean;
  /**
   * QA of the overnight stack (item 7) — the bill was printed and the amount has changed since (a coupon or the discount
   * typed here): print it again, with what is being given. Resolves once the print has been asked for.
   */
  onPrintAgain?: (held: { couponCode?: string; discountMinor?: number }) => Promise<void>;
}) {
  const tPay = useTranslations('payFlow');
  const tc = useTranslations('chrome');
  const nv = useNewVisitCopy();
  const anonymous = isWalkInToken(token);
  const guestLabel = anonymous ? walkInGuestLabel : (token.customerName || walkInGuestLabel);
  /*
   * Owner, 2026-11-15 — the discount at handover ("10% off"), on the Queue's own payment screen: an order sent here
   * unpaid is paid here, so this IS the restaurant's final bill. Points then come off what is left, as at the till.
   */
  const [billOff, setBillOff] = useState<{ offMinor: number; pct: number | null }>({ offMinor: 0, pct: null });
  const [discountOpen, setDiscountOpen] = useState(false);
  /*
   * Jira GRW-735 — the owner's offers: the buy-get offers are already on the order's lines (shown by name), and a coupon
   * typed here. It and the discount above do not stack: the larger is kept, and the row says which (BR-01).
   */
  const [couponCode, setCouponCode] = useState<string | null>(null);
  // Jira GRW-736 — the points the bill is spending, as last quoted (the GST on top comes after them).
  const [redeemMinorAsked, setRedeemMinorAsked] = useState(0);
  // QA of the overnight stack (item 7) — bumped after the bill is printed again, so the quote says whether the paper is current.
  const [printedAgain, setPrintedAgain] = useState(0);
  const [printingAgain, setPrintingAgain] = useState(false);
  const offers = useBillOffers({ saleId: token.id, couponCode: byNameOnly ? null : couponCode, discountMinor: byNameOnly ? 0 : billOff.offMinor, redeemMinor: redeemMinorAsked }, printedAgain);
  const offMinor = offers.couponKept ? (offers.coupon?.offMinor ?? 0) : billOff.offMinor;
  /*
   * Review of the overnight stack (item 1) — the bill before the GST added on top, as the server quotes it: the order's
   * total carries the GST line, so a 100% coupon on the food read as "not the whole bill" and the free-bill rule was
   * asked of the wrong figure. Until the first quote is in, the order's total (the payment is held while it is asked).
   */
  const foodMinor = offers.billMinor ?? token.totalMinor;
  // Jira GRW-736 — GST added on top: the server works it out after the discount and the points, and says what is due.
  const billMinor = Math.max(0, foodMinor - offMinor);
  const { rewards, usePoints, toggle: toggleRedeem, redeemPoints, redeemMinor: discountMinor, checking: pointsChecking } = useRewardQuote(token.customerId, billMinor);
  // Jira GRW-735 — and while a typed coupon is being asked about: its amount is not known yet.
  const checking = pointsChecking || (couponCode !== null && offers.checking) || (offers.taxOnTop && (offers.checking || redeemMinorAsked !== discountMinor));
  useEffect(() => setRedeemMinorAsked(discountMinor), [discountMinor]);
  /** Money is not taken while the points for this bill are still being asked (QA 2026-11-17, finding 1). */
  const busy = saving !== null || checking;
  const dueMinor = offers.taxOnTop && offers.dueMinor !== null ? offers.dueMinor : Math.max(0, billMinor - discountMinor);
  /*
   * Jira GRW-725 — the whole order off is the owner's, with a reason: anyone else is told so and the ways of paying
   * stay shut; the owner is asked why. The server refuses the same.
   */
  const isOwner = useSession()?.role === 'owner';
  const [freeReason, setFreeReason] = useState('');
  const freeBlock = offMinor > 0 ? freeBillBlock(foodMinor, foodMinor - offMinor, isOwner, freeReason) : null;
  const wholeOrderOff = foodMinor > 0 && offMinor >= foodMinor;
  // A code that is not good takes nothing off (AC-02): the reason is shown by it, and the bill is paid as it is.
  const [nameDraft, setNameDraft] = useState('');
  /** Money can be taken once someone is named on the bill — picked from the list, or (a waiter) typed — or "Who is paying?" was skipped. */
  const named = !anonymous || guestSkipped || (byNameOnly && nameDraft.trim() !== '');
  /** Nobody named, and the desk has not skipped the question: nothing about the money is offered yet. */
  const waitsForGuest = anonymous && !guestSkipped;
  const settleWith = (ways: Array<{ mode: PaymentMode; amountMinor: number }>) => {
    if (freeBlock || checking || splitTooBig) return;
    const given = offers.couponKept && couponCode ? { offMinor, pct: null, couponCode } : billOff;
    onSettle(
      ways,
      byNameOnly ? 0 : redeemPoints,
      wholeOrderOff ? { ...given, reason: freeReason.trim() } : given,
      byNameOnly && anonymous ? nameDraft.trim() : undefined,
    );
  };

  const [qrStep, setQrStep] = useState(false);
  const [qrBroken, setQrBroken] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitKeypad, setSplitKeypad] = useState<PaymentMode | null>(null);
  const [splitAmount, setSplitAmount] = useState('');
  const [firstWay, setFirstWay] = useState<{ mode: PaymentMode; minor: number } | null>(null);
  /** The first part is not less than the (new) total: nothing is left for a second way. Shown, never dropped silently. */
  const splitTooBig = firstWay !== null && firstWay.minor >= dueMinor;

  const money = (minor: number) => formatMoney(String(minor));
  const modeWord = (mode: PaymentMode) => tc(`pay.${mode}`);
  const clearSplit = () => {
    setSplitting(false);
    setSplitKeypad(null);
    setSplitAmount('');
    setFirstWay(null);
  };
  /*
   * QA 2026-11-17, finding 2 — the first part of a two-way payment is money already in hand: a discount or the points
   * changing the total no longer wipes it. The rest is worked out again; if the new total is not more than what was
   * taken, the screen says so and waits for the first part to be entered again (see `splitTooBig`).
   */
  const handleToggleRedeem = () => toggleRedeem();
  const waysFor = (mode: PaymentMode): Array<{ mode: PaymentMode; amountMinor: number }> => {
    if (!firstWay || firstWay.mode === mode || firstWay.minor <= 0 || firstWay.minor >= dueMinor) {
      return [{ mode, amountMinor: dueMinor }];
    }
    return [
      { mode: firstWay.mode, amountMinor: firstWay.minor },
      { mode, amountMinor: dueMinor - firstWay.minor },
    ];
  };

  const dueLine = (
    <p className="pf-how-total">
      <span className="pf-how-total-label">{tPay('total')}</span>
      <strong>{money(dueMinor)}</strong>
      {discountMinor > 0 ? (
        <span className="pf-how-total-off">
          {tPay('rewards.wasOff', { bill: money(billMinor), amount: money(discountMinor) })}
        </span>
      ) : null}
    </p>
  );

  if (qrStep && paymentQr) {
    return (
      <div className="pf">
        <header className="pf-head">
          <button
            type="button"
            className="pf-back"
            aria-label={nv.back}
            onClick={() => setQrStep(false)}
            disabled={saving !== null}
          >
            <IconArrowLeft />
          </button>
          <span className="pf-head-stack">
            <h1 className="pf-title">{tPay('qrTitle')}</h1>
            <span className="pf-at">
              {token.tokenLabel} · {guestLabel}
            </span>
          </span>
          <span className="pf-head-gap" aria-hidden="true" />
        </header>
        {dueLine}
        {error ? (
          <div role="alert" className="pf-error">
            {error}
          </div>
        ) : null}
        <div className="pf-qr">
          {qrBroken ? (
            <div className="pf-qr-missing">
              <IconPayUpi />
              <p className="pf-qr-missing-title">{tPay('qrMissing')}</p>
              <Link className="btn btn-ghost" href="/settings/payments">
                {tPay('qrAddIt')}
              </Link>
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="pf-qr-code"
                src={paymentQr}
                alt={tPay('qrAlt')}
                onError={() => setQrBroken(true)}
              />
            </>
          )}
        </div>
        {!qrBroken ? <p className="pf-qr-hint">{tPay('qrHint')}</p> : null}
        <button
          type="button"
          className="btn pf-go pf-qr-paid"
          onClick={() => settleWith(waysFor('upi'))}
          disabled={busy}
          aria-busy={saving === 'upi'}
        >
          {saving === 'upi' ? tPay('saving') : tPay('qrPaid')}
        </button>
      </div>
    );
  }

  const restMinor = firstWay ? Math.max(0, dueMinor - firstWay.minor) : 0;

  return (
    <div className="pf">
      <header className="pf-head">
        <button type="button" className="pf-back" aria-label={nv.back} onClick={onBack} disabled={saving !== null}>
          <IconArrowLeft />
        </button>
        <span className="pf-head-stack">
          <h1 className="pf-title">{tPay('howTitle')}</h1>
          <span className="pf-at">
            {token.tokenLabel} · {guestLabel}
          </span>
        </span>
        <span className="pf-head-gap" aria-hidden="true" />
      </header>
      <div className="pf-row" role="group" aria-label={tPay('who', { client: clientNoun })}>
        <span className="pf-row-label">{tPay('who', { client: clientNoun })}</span>
        {byNameOnly && anonymous ? (
          <input
            className="pf-who-name"
            type="text"
            aria-label={tPay('guestNameOnly')}
            placeholder={tPay('guestNameOnly')}
            value={nameDraft}
            maxLength={60}
            autoComplete="off"
            disabled={saving !== null}
            onChange={(e) => setNameDraft(e.target.value)}
          />
        ) : byNameOnly ? (
          <div className="pf-who-picked">
            <span className="pf-face" aria-hidden="true">
              {(token.customerName ?? '').trim().charAt(0).toUpperCase() || '?'}
            </span>
            <span className="pf-who-picked-name">{token.customerName}</span>
          </div>
        ) : !anonymous ? (
          <div className="pf-who-picked">
            <span className="pf-face" aria-hidden="true">
              {(token.customerName ?? '').trim().charAt(0).toUpperCase() || '?'}
            </span>
            <span className="pf-who-picked-name">{token.customerName}</span>
            {token.customerPhone ? <span className="pf-who-picked-sub">{displayPhone(token.customerPhone)}</span> : null}
            <button
              type="button"
              className="pf-who-clear"
              aria-label={tPay('addClient', { client: nounInSentence(clientNoun) })}
              onClick={() => onOpenClientSheet(false)}
              disabled={saving !== null}
            >
              <IconSearch />
            </button>
          </div>
        ) : (
          <div className="pf-who-bar">
            <button type="button" className="pf-who-search" onClick={() => onOpenClientSheet(false)} disabled={saving !== null}>
              <IconSearch />
              {tPay('nameOrNumber')}
            </button>
            <button
              type="button"
              className="pf-who-add"
              aria-label={tPay('addClient', { client: nounInSentence(clientNoun) })}
              onClick={() => onOpenClientSheet(true)}
              disabled={saving !== null}
            >
              <IconPlus />
            </button>
          </div>
        )}
      </div>
      {dueLine}
      {/* Owner, 2026-11-16 — as on the till's own payment step: not until there is a guest, and money can be taken. */}
      {waitsForGuest || byNameOnly ? null : (
      <button
        type="button"
        className={`pf-discount-open${billOff.offMinor > 0 ? ' is-on' : ''}`}
        onClick={() => setDiscountOpen(true)}
        disabled={saving !== null}
      >
        <span className="pf-discount-badge" aria-hidden="true">
          %
        </span>
        <span className="pf-discount-open-words">
          {billOff.offMinor > 0 ? (billOff.pct !== null ? tPay('discount.onPct', { pct: billOff.pct }) : tPay('discount.on')) : tPay('discount.add')}
        </span>
        {billOff.offMinor > 0 ? (
          <>
            <strong className="pf-discount-open-amount">−{money(billOff.offMinor)}</strong>
            <span className="pf-discount-open-change">{tPay('discount.change')}</span>
          </>
        ) : null}
      </button>
      )}
      {/* Jira GRW-735 — the buy-get offers this order took, and the Coupon code (not for a waiter: like the discount). */}
      <OfferLines bogo={offers.bogo} />
      {offers.taxOnTop && offers.taxMinor > 0 ? (
        <p className="pf-tax-line">
          <span>{tPay('offers.gst')}</span>
          <strong>{money(offers.taxMinor)}</strong>
        </p>
      ) : null}
      {waitsForGuest || byNameOnly ? null : (
        <CouponRow
          code={couponCode}
          coupon={offers.coupon}
          refusal={offers.couponRefusal}
          kept={offers.kept}
          checking={offers.checking}
          disabled={saving !== null}
          onApply={setCouponCode}
          onRemove={() => setCouponCode(null)}
        />
      )}
      {wholeOrderOff ? <FreeBillReason block={freeBlock} reason={freeReason} onReason={setFreeReason} disabled={saving !== null} /> : null}
      {/* QA of the overnight stack (item 7) — the printed bill's QR would ask for the old amount: the guest would pay more. */}
      {offers.printedOutOfDate && !offers.checking && onPrintAgain ? (
        <div className="pf-reprint" role="status">
          <p className="pf-reprint-words">{tPay('amountChanged')}</p>
          <button
            type="button"
            className="btn btn-ghost pf-reprint-btn"
            disabled={saving !== null || printingAgain}
            aria-busy={printingAgain}
            onClick={() =>
              void (async () => {
                setPrintingAgain(true);
                try {
                  await onPrintAgain(offers.couponKept && couponCode ? { couponCode } : billOff.offMinor > 0 ? { discountMinor: billOff.offMinor } : {});
                } finally {
                  setPrintingAgain(false);
                  setPrintedAgain((n) => n + 1);
                }
              })()
            }
          >
            {tPay('amountChangedPrint')}
          </button>
        </div>
      ) : null}
      {discountOpen ? (
        <DiscountSheet
          ownerOnlyFree={!isOwner}
          listMinor={foodMinor}
          current={billOff.offMinor > 0 ? billOff : null}
          onApply={(offMinor, pct) => {
            setBillOff({ offMinor, pct });
            setDiscountOpen(false);
          }}
          onRemove={() => {
            setBillOff({ offMinor: 0, pct: null });
            setDiscountOpen(false);
          }}
          onClose={() => setDiscountOpen(false)}
        />
      ) : null}
      {!anonymous && !byNameOnly ? (
        <RedeemRow rewards={rewards} usePoints={usePoints} onToggle={handleToggleRedeem} disabled={saving !== null} checking={checking} />
      ) : null}
      {error ? (
        <div role="alert" className="pf-error">
          {error}
        </div>
      ) : null}
      {named ? (
        <>
          <div className="pf-pay" role="group" aria-label={tPay('howTitle')}>
            {firstWay ? (
              <p className="pf-split-held" role="status">
                <span>
                  {tPay(splitTooBig ? 'split.tooBig' : 'split.then', {
                    amount: money(firstWay.minor),
                    mode: modeWord(firstWay.mode),
                    rest: money(restMinor),
                  })}
                </span>
                <button
                  type="button"
                  className="icon-btn pf-split-clear"
                  aria-label={tPay('split.clear')}
                  onClick={clearSplit}
                >
                  <IconClose />
                </button>
              </p>
            ) : splitting ? (
              <p className="pf-split-held" role="status">
                <span>{tPay('split.first')}</span>
                <button
                  type="button"
                  className="icon-btn pf-split-clear"
                  aria-label={tPay('split.clear')}
                  onClick={clearSplit}
                >
                  <IconClose />
                </button>
              </p>
            ) : null}
            {(['cash', 'upi', 'card', 'other'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`pf-pay-tile pf-pay-${m}`}
                disabled={busy || splitTooBig || firstWay?.mode === m || freeBlock !== null}
                aria-busy={saving === m}
                onClick={() => {
                  if (splitting && !firstWay) {
                    setSplitKeypad(m);
                    setSplitAmount('');
                    return;
                  }
                  if (m === 'upi' && paymentQr && !firstWay && dueMinor > 0) {
                    setQrStep(true);
                    return;
                  }
                  settleWith(waysFor(m));
                }}
              >
                <span className="pf-pay-icon" aria-hidden="true">
                  {QUEUE_PAY_ICONS[m]}
                </span>
                <span className="pf-pay-word">
                  {saving === m ? tPay('saving') : m === 'other' ? tPay('other') : modeWord(m)}
                </span>
                <span className="pf-pay-sub">{tPay(`sub.${m}`)}</span>
              </button>
            ))}
          </div>
          {!splitting && !firstWay ? (
            <div className="pos-charge-actions pos-charge-actions-mobile">
              <button
                type="button"
                className="pf-split-link"
                onClick={() => setSplitting(true)}
                disabled={saving !== null}
              >
                {tPay('split.link')}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {splitKeypad !== null ? (
        <Keypad
          title={tPay('split.howMuch', { mode: modeWord(splitKeypad) })}
          value={splitAmount}
          hint={tPay('split.restHint')}
          onChange={setSplitAmount}
          onDone={() => {
            const rupees = Number(splitAmount);
            const minor = Number.isFinite(rupees) && splitAmount !== '' ? Math.round(rupees * 100) : 0;
            const mode = splitKeypad;
            setSplitKeypad(null);
            setSplitAmount('');
            setSplitting(false);
            if (minor <= 0) return;
            if (minor >= dueMinor) {
              setFirstWay(null);
              settleWith([{ mode, amountMinor: dueMinor }]);
              return;
            }
            setFirstWay({ mode, minor });
          }}
          onClose={() => {
            setSplitKeypad(null);
            setSplitAmount('');
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The POS tab: the till, live daily kitchen token queue, and product return on one screen.
 *
 * ## Sell
 * Is the till that already existed (`/products/sell`, `PayFlow` with `productsOnly`) and stays mounted under everything
 * else, so a return or queue check taken in the middle of a sale never costs the person at the counter their cart.
 * Above the dish grid sits the compact Live Token Queue Strip showing active tokens in the kitchen (`#12`, `#13`, `#14`)
 * with one-tap completion.
 *
 * ## Queue
 * Is the two-column daily token board: `In queue · Preparing` on the left and `Completed today` on the right, with a
 * sequential daily token number (`#01`, `#02`, …) that resets each day per branch.
 *
 * ## Return
 * Is the return sheet the Sales register uses, with its own finder and rules.
 */
export function PosClient({
  timezone,
  todayISO,
  returnWindowDays,
  canReturn,
  returnBranch = null,
  initialMode,
  initialToken,
  heading,
  backTo,
  waiter = false,
}: {
  /** Jira GRW-723 — a waiter's till: the room only (see `waiter.ts`). */
  waiter?: boolean;
  timezone: string;
  todayISO: string;
  returnWindowDays: number;
  canReturn: boolean;
  /** The only branch whose bills this person may take back; null for the owner or a member with no branch. */
  returnBranch?: string | null;
  initialMode: PosMode;
  /** Optional token id or number (`#07`, `7`, or visit UUID) to scroll to and highlight when opening the Queue board. */
  initialToken?: string;
  /** A shop's name for the till. Absent is "Sell product". */
  heading?: string;
  backTo?: '/products' | '/sales';
}) {
  const t = useTranslations('pos');
  const tPay = useTranslations('payFlow');
  const tNouns = useTranslations('nouns');
  const tc = useTranslations('chrome');
  const tTables = useTranslations('posTables');
  const nv = useNewVisitCopy();
  const locale = useLocale();
  const { Customer } = useNouns();
  const clientNoun = pickNoun(locale, useLabel('customer', 'Client'), tNouns('customer'));
  const productsNoun = useLabel('products', 'Products');
  const providerNoun = useLabel('provider', 'Staff member');
  const branch = useBranch();
  const session = useSession();
  const location = branch.choice ?? branch.one ?? session?.branches?.[0]?.id ?? null;
  /*
   * Owner, 17 Nov 2026 — at a restaurant with tables on, the Queue holds only takeaway and delivery (dine-in lives on the
   * table map), so it is called Pickup there. Tables off — and every salon and shop — it stays the Queue.
   */
  /*
   * Owner, 2026-11-23 — a restaurant keeps the one-row bar, Pickup under Takeaway and Return in the ⋮ with its tables
   * switched off too; only Dine-in goes (PayFlow's `typesHere`). Salons and shops keep their Sell · Queue · Return.
   */
  const typesHere = Boolean(session?.areas?.tables);
  const qk = <K extends string>(key: K): K | `${K}Pickup` => (typesHere ? `${key}Pickup` : key);
  const paymentQr =
    branch.branches.find((b) => b.id === location)?.paymentQrUrl ??
    session?.branches?.find((b) => b.id === location)?.paymentQrUrl ??
    null;

  // Owner, 10 Nov 2026 — only a kitchen has an order queue; a salon's or a shop's till is Sell and Return alone.
  const areas = useAreas();
  const orderQueue = hasOrderQueue(areas);
  // Jira GRW-747 — at a business that counts no stock (a kitchen's) a name alone stays on the order, not in Guests.
  const guestOptional = !areas.stock;
  const [mode, setMode] = useState<PosMode>(initialMode === 'queue' && orderQueue ? 'queue' : 'sell');
  const [fullScreen, setFullScreen] = useState(false);
  const [bills, setBills] = useState<SaleRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Today's raw appointments/sales for daily token generation and live queue tracking. */
  const [todayRows, setTodayRows] = useState<Appointment[]>([]);
  const [tokenOverrides, setTokenOverrides] = useState<Record<string, PosTokenOverride>>({});
  const [payingToken, setPayingToken] = useState<PosDailyToken | null>(null);
  /** Owner, 17 Nov 2026 — the table being paid on this payment screen (its name), or null for a Pickup order. */
  const [payingTable, setPayingTable] = useState<string | null>(null);
  const [clientSheetTarget, setClientSheetTarget] = useState<{ token: PosDailyToken; startAdding: boolean } | null>(null);
  /** Owner, 2026-11-22 — the Pickup order whose "Who is paying?" was skipped: it is paid as Walk-in. */
  const [guestSkippedFor, setGuestSkippedFor] = useState<string | null>(null);
  const [settlingMode, setSettlingMode] = useState<PaymentMode | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);
  /** Owner, 9 Nov 2026 — the unpaid order the Sell tab is adding to ("Add items"), and the one being cancelled. */
  const [addingToToken, setAddingToToken] = useState<PosDailyToken | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PosDailyToken | null>(null);
  /**
   * Jira GRW-747 — owner, 2026-11-22: an unpaid takeaway could only grow or be cancelled whole; 2026-11-23: "keep it simple, should be able
   * to edit in same card". Edit puts − and + on the card's own dishes. The owner's or a manager's, as taking a dish off a table bill is
   * (the server says the same); a counter still has Add items and Cancel order.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Owner, 2026-11-23 — the card whose ⋮ is open; its Edit and Cancel order show inside that card. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /*
   * Owner, 2026-11-23 — two of the till's settings are words in its ⋮: the printer on a phone (the bar has no room for its
   * button below 760px, and on the paid screen it stood alone on a row of its own), and whether a payment is said out loud.
   */
  const [printerOpen, setPrinterOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    setSoundOn(soundIsOn());
    const q = window.matchMedia('(max-width: 759px)');
    const on = () => setNarrow(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  const mayEdit = session?.role === 'owner' || session?.role === 'manager';
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Jira GRW-737 — the server asked whether the kitchen had already cooked it (`cooked_unknown`): asked in the cancel dialog, required.
  const [cancelAskCooked, setCancelAskCooked] = useState(false);
  const [cancelCooked, setCancelCooked] = useState<boolean | undefined>(undefined);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  /** Jira GRW-713 — this till's printer, and the last KOT the queue made (an addition, a cancellation) to print. */
  const printer = useTicketPrinter();
  const [lastKot, setLastKot] = useState<{ saleId: string; kot: KitchenSlips; order: OrderRef } | null>(null);
  const [settledReceipt, setSettledReceipt] = useState<{
    appointmentId: string;
    totalMinor: number;
    mode: PaymentMode;
    modeLabel: string;
    summary: string;
    bill: ReceiptRow[];
    phone: string | null;
  } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [reloadKey, setReloadKey] = useState(0);
  const [focusToken, setFocusToken] = useState<string | null>(() => initialToken?.trim() || null);
  const [highlightedTokenId, setHighlightedTokenId] = useState<string | null>(null);
  const lastQueuedIdRef = useRef<string | null>(null);
  /** Only the latest open may answer: a slow read from an earlier open must not put old bills under a newer sheet. */
  const opened = useRef(0);
  /* Owner, 2026-11-03 — the till's own Back, moved up into the bar. The action is still the till's. */
  const leaveRef = useRef<(() => void) | null>(null);

  const storageKey = posQueueStorageKey(location, todayISO);

  // Load persisted token state overrides for today and this branch
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, PosTokenOverride>;
        if (parsed && typeof parsed === 'object') {
          setTokenOverrides(parsed);
          return;
        }
      }
    } catch {
      // Ignore storage errors
    }
    setTokenOverrides({});
  }, [storageKey]);

  const loadTodayTokens = useCallback(async () => {
    try {
      // QA 13 Nov 2026, bug 10 — the queue's own read: a desk the takings are not opened to gets the orders without amounts. Asking for
      // the Sales register here was refused for the desk, which left its queue empty under the order it had just rung up.
      const rows = await api.appointments(todayISO, todayISO, undefined, undefined, {
        includeSales: 'queue',
      });
      setTodayRows(rows);
      setNowMs(Date.now());
    } catch {
      // Keep last known rows on transient error
    }
  }, [todayISO]);

  useEffect(() => {
    void loadTodayTokens();
  }, [loadTodayTokens]);

  /*
   * Owner, 4 Nov 2026 — a handover is told to the server, so every device on the account agrees.
   *
   * It used to be written ONLY here, into this browser's `localStorage`: the desk that tapped "Mark completed"
   * cleared the token from its own screen and the kitchen's phone kept showing it for ever. The local write stays
   * as the optimistic layer — the tap should feel instant, and an offline tap should not be lost — but the server
   * is the truth, and `buildDailyTokens` lets its answer win on the next read.
   */
  const setTokenState = useCallback(
    (visitId: string, state: PosTokenState, recalled = false) => {
      const now = Date.now();
      void (async () => {
        try {
          await api.setSaleHandover(visitId, state === 'completed');
          await loadTodayTokens();
        } catch {
          // The local flag above still holds this device's view; the next read reconciles it with the shop's.
        }
      })();
      const val: PosTokenOverride = recalled && state === 'preparing' ? `preparing:${now}` : state;
      if (recalled && state === 'preparing') setNowMs(now);
      setTokenOverrides((prev) => {
        const next = { ...prev, [visitId]: val };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
        return next;
      });
    },
    [storageKey, loadTodayTokens],
  );

  const handleSaleCompleted = useCallback(
    (saleId: string) => {
      setLastKot(null);
      lastQueuedIdRef.current = saleId;
      setTokenState(saleId, 'preparing');
      void loadTodayTokens();
    },
    [setTokenState, loadTodayTokens],
  );

  const dailyTokens = useMemo(
    () => buildDailyTokens(todayRows, location, tokenOverrides, nowMs),
    [todayRows, location, tokenOverrides, nowMs],
  );
  const preparingTokens = useMemo(
    () =>
      [...tokensStillOnTheBoard(dailyTokens).filter((tk) => tk.state === 'preparing')].sort(
        (a, b) => b.elapsedMin - a.elapsedMin || a.tokenNo - b.tokenNo,
      ),
    [dailyTokens],
  );
  const completedTokens = useMemo(
    () => [...tokensStillOnTheBoard(dailyTokens).filter((tk) => tk.state === 'completed')].reverse(),
    [dailyTokens],
  );
  // A label only ("New order (#06)"): the number itself is issued by the API when the order is rung up, and the slip
  // prints that one. One past the highest, never the count plus one, which a cancelled order made a number in use.
  const nextTokenNo = dailyTokens.reduce((n, tk) => Math.max(n, tk.tokenNo), 0) + 1;

  // Only tick `nowMs` when the Queue tab is open and has active tokens waiting; zero background timers on Sell/Return.
  const hasPreparing = preparingTokens.length > 0;
  useEffect(() => {
    if (mode !== 'queue' || !hasPreparing) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [mode, hasPreparing]);

  /*
   * Owner, 4 Nov 2026 — the queue re-reads itself while somebody is watching it.
   *
   * The timer above only advanced the "16m ago" label; nothing ever asked the server again. So a payment taken,
   * or an order handed over, by the OTHER desk on the same account was invisible until this one switched tabs or
   * reloaded — which is not something a person staring at a queue thinks to do.
   *
   * Only while the Queue tab is open and the screen is actually in front of somebody: a phone in a pocket and the
   * Sell tab cost nothing, as before. Twenty seconds is the width of the window in which two desks disagree, and
   * one small read of today's own rows is what it costs.
   */
  useEffect(() => {
    if (mode !== 'queue') return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadTodayTokens();
    };
    const timer = window.setInterval(refresh, 20_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [mode, loadTodayTokens]);

  const formatTime = useCallback(
    (iso: string) => {
      try {
        return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(iso));
      } catch {
        return '';
      }
    },
    [locale, timezone],
  );

  const channelLabel = useCallback(
    (ch: string) => {
      if (ch === 'swiggy') return t('channelSwiggy');
      if (ch === 'zomato') return t('channelZomato');
      return t('channelCounter');
    },
    [t],
  );

  const payModeLabel = useCallback(
    (m: string) => {
      if (m === 'cash') return t('modeCash');
      if (m === 'upi') return t('modeUpi');
      if (m === 'card') return t('modeCard');
      return t('modeOther');
    },
    [t],
  );

  const attachClientToToken = useCallback(
    async (tk: PosDailyToken, picked: PickedClient) => {
      try {
        const res = await api.assignClientToSale(
          tk.id,
          picked.id
            ? { customerId: picked.id }
            : picked.waPhone
              ? { phone: picked.waPhone, ...(picked.name ? { name: picked.name } : {}) }
              : { name: picked.name ?? '' },
        );
        const nextCustomerId = res.customerId;
        const nextName = picked.name;
        const nextPhone = picked.waPhone;
        setTodayRows((prev) =>
          prev.map((r) =>
            (r.bookingGroupId ?? r.id) === tk.id
              ? {
                  ...r,
                  customerId: nextCustomerId,
                  // Jira GRW-747 — a number given with no name keeps the name the order already had ("Rahul").
                  customerName: nextName ?? r.customerName,
                  customerPhone: nextPhone,
                }
              : r,
          ),
        );
        setPayingToken((prev) =>
          prev && prev.id === tk.id
            ? {
                ...prev,
                customerId: nextCustomerId,
                customerName: nextName ?? prev.customerName,
                customerPhone: nextPhone,
              }
            : prev,
        );
      } catch (e) {
        setSettleError(e instanceof Error && e.message ? e.message : t('settleFailed'));
      } finally {
        setClientSheetTarget(null);
      }
    },
    [t],
  );

  const cancelUnpaidOrder = useCallback(async () => {
    const tk = cancelTarget;
    if (!tk || cancelBusy) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      if (cancelAskCooked && cancelCooked === undefined) {
        setCancelError(tTables('cookedNeeded'));
        return;
      }
      const res = await api.cancelPendingCounterSale(tk.id, cancelAskCooked ? cancelCooked : undefined);
      // Jira GRW-713 — the kitchen is told to stop: printed now where this till prints by itself, a tap away otherwise.
      // Jira GRW-733 — one cancel slip per station that had the order.
      const cancelled = slipsOf(res);
      if (cancelled) {
        const order = { tokenNo: tk.tokenNo, offlineToken: tk.offlineToken, channel: tk.channel };
        setLastKot({ saleId: tk.id, kot: cancelled, order });
        printer.autoKot(cancelled, order);
      }
      // Gone from the board at once; the read after it is the shop's answer for every other device.
      setTodayRows((prev) => prev.filter((r) => (r.bookingGroupId ?? r.id) !== tk.id));
      setCancelTarget(null);
      setReloadKey((k) => k + 1);
      void loadTodayTokens();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cooked_unknown') {
        setCancelAskCooked(true);
        return;
      }
      setCancelError(e instanceof Error && e.message ? e.message : t('cancelFailed'));
      // Paid or cancelled on another device meanwhile: the board should show it as it is now.
      void loadTodayTokens();
    } finally {
      setCancelBusy(false);
    }
  }, [cancelTarget, cancelBusy, loadTodayTokens, t, tTables, printer, cancelAskCooked, cancelCooked]);

  const startAddingTo = useCallback((tk: PosDailyToken) => {
    setQueueNote(null);
    // Review finding 9 — the last KOT's Print button belongs to that moment, not to the rest of the shift.
    setLastKot(null);
    setAddingToToken(tk);
    setMode('sell');
  }, []);

  const settleAndCompleteToken = useCallback(
    async (
      tk: PosDailyToken,
      ways?: Array<{ mode: PaymentMode; amountMinor: number }>,
      redeemPoints = 0,
      billOff: { offMinor: number; pct: number | null; reason?: string; couponCode?: string } = { offMinor: 0, pct: null },
    ) => {
      if (!tk.paymentPending) {
        setTokenState(tk.id, 'completed');
        return;
      }
      if (!ways || ways.length === 0) {
        setSettleError(null);
        setPayingToken(tk);
        if (isWalkInToken(tk) && tk.channel === 'counter' && !waiter) {
          setClientSheetTarget({ token: tk, startAdding: false });
        }
        return;
      }
      if (settlingMode) return;
      const chosen = ways.reduce((best, w) => (w.amountMinor > best.amountMinor ? w : best), ways[0]!).mode;
      setSettlingMode(chosen);
      setSettleError(null);
      try {
        const settled = await api.settleCounterSale(tk.id, {
          paymentMode: chosen,
          ...(ways.length > 1 ? { payments: ways } : {}),
          // Jira GRW-735 — a kept coupon goes by its code, never with the discount beside it (they do not stack).
          ...(billOff.couponCode ? { couponCode: billOff.couponCode } : billOff.offMinor > 0 ? { discountMinor: billOff.offMinor } : {}),
          ...(billOff.reason ? { discountReason: billOff.reason } : {}),
          ...(redeemPoints > 0 ? { redeemPoints } : {}),
        });
        const paidMinor = settled.paidAmountMinor ?? tk.totalMinor;
        const discountMinor = settled.rewards?.discountMinor ?? 0;
        setTodayRows((prev) =>
          prev.map((r) => {
            if ((r.bookingGroupId ?? r.id) !== tk.id) return r;
            let remDiscount = discountMinor;
            const updatedProducts =
              discountMinor > 0 && r.products
                ? r.products.map((p) => {
                    const gross = Math.max(0, Number(p.paidMinor ?? 0));
                    const take = Math.min(gross, remDiscount);
                    remDiscount -= take;
                    return { ...p, paidMinor: String(gross - take) };
                  })
                : r.products;
            return {
              ...r,
              paymentMode: chosen,
              paymentPending: false,
              payments: ways.map((w) => ({ mode: w.mode, amountMinor: String(w.amountMinor) })),
              products: updatedProducts,
            };
          }),
        );
        setTokenState(tk.id, 'completed');
        setPayingToken(null);
        setLastKot(null);
        // Jira GRW-713 — the guest's bill, printed by itself where this till is set to.
        // A waiter prints no bill (owner decision 2026-11-16).
        if (!waiter) printer.autoBill(tk.id);
        void loadTodayTokens();
        const paidBy =
          ways.length > 1
            ? ways.map((w) => `${payModeLabel(w.mode)} ${formatMoney(String(w.amountMinor))}`).join(' · ')
            : payModeLabel(chosen);
        const when = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
          timeZone: timezone,
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(tk.startAt));
        const branchName =
          (session?.branches?.length ?? 0) > 1
            ? (session?.branches?.find((b) => b.id === location)?.name ?? null)
            : null;
        const googleReviewUrl =
          branch.branches.find((b) => b.id === location)?.googleReviewUrl ??
          session?.branches?.find((b) => b.id === location)?.googleReviewUrl ??
          null;
        const bill = receiptRows(
          {
            businessName: session?.businessName ?? null,
            branchName,
            when,
            tokenNo: tk.tokenNo,
            stylist: null,
            singles: [],
            products: tk.items.flatMap((item) => {
              const count = Math.max(1, item.qty);
              const unit = Math.round(item.paidMinor / count);
              return Array.from({ length: count }, (_, idx) => ({
                name: item.name,
                amountMinor: idx === count - 1 ? item.paidMinor - unit * (count - 1) : unit,
              }));
            }),
            pkg: null,
            pkgs: [],
            totalMinor: paidMinor,
            // Owner, 2026-11-15 — the discount given at the Queue, named as the till names one: "Discount (10%): −₹36".
            adjustMinor: -billOff.offMinor,
            discountPct: billOff.offMinor > 0 ? billOff.pct : null,
            ...(settled.rewards
              ? {
                  rewards: {
                    earnedPoints: settled.rewards.earnedPoints,
                    redeemedPoints: settled.rewards.redeemedPoints,
                    redeemedMinor: settled.rewards.discountMinor,
                    ...(settled.rewards.balanceAfter !== null ? { balancePoints: settled.rewards.balanceAfter } : {}),
                    ...(settled.rewards.pointValueMinor ? { pointValueMinor: settled.rewards.pointValueMinor } : {}),
                    ...(settled.rewards.spendableAfter !== undefined ? { spendableAfter: settled.rewards.spendableAfter } : {}),
                    ...(settled.rewards.minRedeemPoints !== undefined ? { minRedeemPoints: settled.rewards.minRedeemPoints } : {}),
                    ...(settled.rewards.expiring
                      ? {
                          expiringPoints: settled.rewards.expiring.points,
                          expiringOn: formatDate(settled.rewards.expiring.atISO, timezone, locale),
                        }
                      : {}),
                  },
                }
              : {}),
            paidBy,
            googleReviewUrl,
          },
          {
            title: nv.receiptTitle,
            thanks: nv.receiptThanks,
            services: nv.receiptServices,
            products: pickNoun(locale, productsNoun, nv.receiptProducts),
            token: nv.token,
            stylist: (name) => nv.receiptStylist(providerNoun, name),
            packageName: nv.receiptPackage,
            separately: nv.receiptSeparately,
            total: nv.receiptTotal,
            discount: nv.receiptDiscount,
            extra: nv.receiptExtra,
            saved: nv.receiptSaved,
            rewardsTitle: tPay('rewards.receiptTitle'),
            rewardRedeemed: (points, amount) => tPay('rewards.receiptUsed', { points, amount }),
            rewardEarned: (points) => tPay('rewards.receiptEarned', { points }),
            rewardBalance: (points, worth) =>
              worth ? tPay('rewards.receiptBalance', { points, worth }) : tPay('rewards.receiptBalanceOnly', { points }),
            rewardExpiry: (points, date) => tPay('rewards.receiptExpiry', { points, date }),
            paidBy: nv.receiptPaidBy,
            seeYou: nv.receiptSeeYou,
            reviewPrompt: nv.receiptReviewPrompt,
          },
          (minor) => formatMoney(String(minor)),
        );
        setSettledReceipt({
          appointmentId: tk.id,
          totalMinor: paidMinor,
          mode: chosen,
          modeLabel: paidBy,
          summary: [
            tk.offlineToken ?? nv.token(tk.tokenNo),
            paidBy,
            tk.items.map((i) => i.name).join(' + '),
            (settled.rewards?.earnedPoints ?? 0) > 0
              ? tPay('rewards.earnedDone', { points: settled.rewards!.earnedPoints })
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
          bill,
          phone: tk.customerPhone,
        });
      } catch (e) {
        setSettleError(e instanceof Error && e.message ? e.message : t('settleFailed'));
      } finally {
        setSettlingMode(null);
      }
    },
    [
      settlingMode,
      setTokenState,
      loadTodayTokens,
      t,
      tPay,
      nv,
      locale,
      timezone,
      session,
      location,
      branch.branches,
      productsNoun,
      providerNoun,
      payModeLabel,
      printer,
      waiter,
    ],
  );

  const enterFullScreen = useCallback(() => {
    setFullScreen(true);
    try {
      const el = typeof document !== 'undefined' ? (document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }) : null;
      if (el && !document.fullscreenElement) {
        if (typeof el.requestFullscreen === 'function') {
          void el.requestFullscreen().catch(() => {});
        } else if (typeof el.webkitRequestFullscreen === 'function') {
          void el.webkitRequestFullscreen();
        }
      }
    } catch {
      // CSS full-viewport mode still activates if the browser blocks native fullscreen.
    }
  }, []);

  const exitFullScreen = useCallback(() => {
    setFullScreen(false);
    try {
      const doc = typeof document !== 'undefined' ? (document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void }) : null;
      if (doc && (doc.fullscreenElement || doc.webkitFullscreenElement)) {
        if (typeof doc.exitFullscreen === 'function') {
          void doc.exitFullscreen().catch(() => {});
        } else if (typeof doc.webkitExitFullscreen === 'function') {
          void doc.webkitExitFullscreen();
        }
      }
    } catch {
      // Ignore if not in native fullscreen.
    }
  }, []);

  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.sheet-backdrop, .pf-keypad-scrim')) {
        e.preventDefault();
        exitFullScreen();
      }
    };
    const onFsChange = () => {
      const doc = typeof document !== 'undefined' ? (document as Document & { webkitFullscreenElement?: Element | null }) : null;
      if (doc && !doc.fullscreenElement && !doc.webkitFullscreenElement) {
        setFullScreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, [fullScreen, exitFullScreen]);

  const openReturn = useCallback(async () => {
    const mine = ++opened.current;
    setMode('return');
    // Cleared first so the sheet mounts once, on fresh bills, instead of showing the last open's and swapping them.
    setBills(null);
    setFailed(false);
    setLoading(true);
    try {
      const rows: Appointment[] = await api.appointments(returnLookbackFrom(todayISO, returnWindowDays), todayISO, undefined, undefined, {
        includeSales: true,
      });
      if (mine !== opened.current) return;
      // Owner, 2026-10-24 — "No return": a Swiggy or Zomato order is returned and refunded by the app, so it is not offered here.
      // Unpaid counter orders still waiting in the queue for payment are filtered out inside `buildSaleRows`.
      // Owner, 2026-11-14 — a manager's till offers only their own branch's bills: the API refuses the rest (loophole 1).
      setBills(buildSaleRows(rows.filter((r) => !isDeliveryApp(r.channel ?? 'counter') && (!returnBranch || r.locationId === returnBranch)), timezone));
    } catch {
      if (mine !== opened.current) return;
      setBills(null);
      setFailed(true);
    } finally {
      if (mine === opened.current) setLoading(false);
    }
  }, [todayISO, returnWindowDays, timezone, returnBranch]);

  /*
   * Owner, 17 Nov 2026 — "these options should be as we have without tables": a table's Take payment opens this
   * payment screen — the ways to pay, split, discount, points, the QR and the guest — not three buttons on its sheet.
   * The bill is read fresh (a round may have just gone in) and shown under the table's name, with no token number.
   */
  const payTable = useCallback(
    async ({ saleId, tableName }: { saleId: string; tableName: string }) => {
      if (waiter) {
        // A waiter reads no day's list: the bill itself, as the table's sheet does (GET /orders/:id is theirs).
        let o: OrderDetail;
        try {
          o = await api.order(saleId);
        } catch {
          setQueueNote(t('tablePayFailed'));
          return;
        }
        setPayingTable(tableName);
        void settleAndCompleteToken(tableBillToken(o, tableName));
        return;
      }
      let rows: typeof todayRows;
      try {
        rows = await api.appointments(todayISO, todayISO, undefined, undefined, { includeSales: 'queue' });
      } catch {
        setQueueNote(t('tablePayFailed'));
        return;
      }
      setTodayRows(rows);
      const legs = rows.filter((r) => (r.bookingGroupId ?? r.id) === saleId).map((r) => ({ ...r, tableName: null }));
      const tk = buildDailyTokens(legs, location, {}, Date.now())[0];
      if (!tk || !tk.paymentPending) {
        setQueueNote(t('tablePayFailed'));
        return;
      }
      setPayingTable(tableName);
      void settleAndCompleteToken({ ...tk, tokenNo: 0, offlineToken: null, tokenLabel: tableName });
    },
    [todayISO, location, settleAndCompleteToken, t, waiter],
  );
  // Paid: the room reads again, so the table's tile is free when the receipt is closed.
  useEffect(() => {
    if (settledReceipt && payingTable !== null) setReloadKey((k) => k + 1);
  }, [settledReceipt, payingTable]);

  const openQueue = useCallback(
    (targetToken?: unknown) => {
      opened.current++;
      setMode('queue');
      setAddingToToken(null);
      if (typeof targetToken === 'string' && targetToken.trim()) {
        setFocusToken(targetToken.trim());
      }
      setPayingToken(null);
      setClientSheetTarget(null);
      setSettleError(null);
      setSettledReceipt(null);
      setLoading(false);
      setFailed(false);
      void loadTodayTokens();
    },
    [loadTodayTokens],
  );

  useEffect(() => {
    const raw = initialToken?.trim();
    if (raw && orderQueue) {
      setMode('queue');
      setFocusToken(raw);
    }
  }, [initialToken, orderQueue]);

  useEffect(() => {
    if (mode !== 'queue' || !focusToken || dailyTokens.length === 0) return;
    const cleaned = focusToken.replace(/^#0*/, '');
    const target = dailyTokens.find(
      (tk) =>
        tk.id === focusToken ||
        String(tk.tokenNo) === cleaned ||
        tk.tokenLabel.toLowerCase() === focusToken.toLowerCase(),
    );
    if (!target) return;
    setFocusToken(null);
    setHighlightedTokenId(target.id);
  }, [mode, focusToken, dailyTokens]);

  useEffect(() => {
    if (mode !== 'queue' || !highlightedTokenId) return;
    const el = typeof document !== 'undefined' ? document.getElementById(`pos-token-${highlightedTokenId}`) : null;
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const clearTimer = window.setTimeout(() => {
      setHighlightedTokenId((cur) => (cur === highlightedTokenId ? null : cur));
    }, 4000);
    return () => window.clearTimeout(clearTimer);
  }, [mode, highlightedTokenId]);

  const closeReturn = useCallback(() => {
    opened.current++;
    setMode('sell');
    setPayingToken(null);
    setClientSheetTarget(null);
    setSettleError(null);
    setSettledReceipt(null);
    setLoading(false);
    setFailed(false);
  }, []);

  // `?mode=return` is a link someone follows to take a return; it opens once, on arrival.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (initialMode === 'return' && canReturn) void openReturn();
  }, [initialMode, canReturn, openReturn]);

  /*
   * Owner, 2026-11-22 ("go D") — a branch that seats its guests has ONE row on top: the till's Dine-in · Takeaway ·
   * Delivery (drawn into `typeSlot`), the Kitchen, and a ⋮ for Return. Pickup is under Takeaway. Not for a waiter (who has
   * no switch) and not in full screen (which keeps its own header).
   */
  const tablesBar = typesHere && !waiter && !fullScreen;
  const [typeSlot, setTypeSlot] = useState<HTMLDivElement | null>(null);
  const [tillType, setTillType] = useState<TillOrderType | null>(null);
  const pickupCount = orderQueue ? preparingTokens.length : null;
  const typeBar = useMemo<PosTypeBar | null>(
    () => (tablesBar ? { slot: typeSlot, mode, pickupCount, toSell: closeReturn, onTypeShown: setTillType } : null),
    [tablesBar, typeSlot, mode, pickupCount, closeReturn],
  );
  /** New order / Pickup, under Takeaway: shown while the till is on Takeaway, and in Pickup itself. */
  const pickupSwitch =
    tablesBar && orderQueue && (mode === 'queue' || (mode === 'sell' && tillType === 'takeaway')) && addingToToken === null && payingTable === null ? (
      <div className="page-tabs pos-pickup-switch" role="tablist" aria-label={t('takeawayViews')}>
        <button type="button" role="tab" aria-selected={mode === 'sell'} className={`page-tab${mode === 'sell' ? ' active' : ''}`} onClick={closeReturn}>
          {t('newOrderTab')}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'queue'} className={`page-tab${mode === 'queue' ? ' active' : ''}`} onClick={() => openQueue()}>
          {/* Owner, 2026-11-23 ("not clearly visible") — the count is the amber pill the Sell / Queue tabs use, not "· 3" in the word. */}
          {t('pickupTabWord')}
          <span className={`pos-tab-badge${preparingTokens.length > 0 ? ' is-live' : ''}`}>{preparingTokens.length}</span>
        </button>
      </div>
    ) : null;

  const renderTokenCard = (tk: PosDailyToken, isPreparing: boolean, isFirst = false) => {
    const anonymous = isWalkInToken(tk);
    const guest = anonymous ? t('walkInGuest') : (tk.customerName || t('walkInGuest'));
    const elapsedText = tk.elapsedMin <= 0 ? t('elapsedJustNow') : t('elapsedMin', { min: tk.elapsedMin });
    const isOverdue = isPreparing && tk.elapsedMin >= 15;
    const isWarn = isPreparing && tk.elapsedMin >= 10 && tk.elapsedMin < 15;
    const slaTone = isOverdue ? ' is-overdue' : isWarn ? ' is-warn' : ' is-fresh';
    const isTarget = highlightedTokenId === tk.id;
    const cardStateClass = isPreparing
      ? ` is-preparing${isFirst ? ' is-first' : ''}${isOverdue ? ' is-overdue' : ''}${tk.paymentPending ? ' is-unpaid' : ''}${isTarget ? ' is-target' : ''}`
      : ` is-completed${tk.paymentPending ? ' is-unpaid' : ''}${isTarget ? ' is-target' : ''}`;
    return (
      <article key={tk.id} id={`pos-token-${tk.id}`} data-token-no={tk.tokenNo} className={`pos-qcard${cardStateClass}`}>
        {isPreparing && isFirst ? (
          <div className={`pos-qcard-priority${isOverdue ? ' is-overdue' : ''}`}>
            <span>⚡ {isOverdue ? t('deliverFirstOverdue') : t('deliverFirst')}</span>
          </div>
        ) : null}
        <div className="pos-qcard-top">
          <div className="pos-qcard-id">
            <span className="pos-qcard-token">{tk.tokenLabel}</span>
            <span className={`pos-qcard-chan is-${tk.channel}`}>{channelLabel(tk.channel)}</span>
            {tk.kitchenReady && tk.state === 'preparing' ? <span className="pos-qcard-ready">{t('kitchenReady')}</span> : null}
            {tk.paymentPending ? (
              <span className="pos-qcard-pay is-pending">
                <span className="pos-qcard-pay-dot" aria-hidden="true" />
                {t('paymentPendingBadge')}
              </span>
            ) : !isDeliveryApp(tk.channel) ? (
              <span className="pos-qcard-pay is-paid">
                <IconCheck />
                <span>
                  {tk.paymentMode
                    ? t('paidViaBadge', { mode: payModeLabel(tk.paymentMode) })
                    : t('paidBadge')}
                </span>
              </span>
            ) : null}
          </div>
          <div className="pos-qcard-meta">
            {isPreparing ? (
              <span className={`pos-qcard-elapsed${slaTone}`}>{elapsedText}</span>
            ) : (
              <span className="pos-qcard-done-pill">
                <IconCheck />
                {t('statusCompleted')}
              </span>
            )}
          </div>
        </div>
        <div className="pos-qcard-sub">
          <span className="pos-qcard-guest">{guest}</span>
          {/*
            Jira GRW-747 (FR-06) — a name with no number ("Rahul") is offered it too: a name alone stays on this order, and the
            number is what makes them a guest. A guest with a number has nothing to add here.
          */}
          {(anonymous || (guestOptional && !tk.customerPhone)) && tk.channel === 'counter' ? (
            <button
              type="button"
              className="pos-qcard-add-client"
              onClick={() => setClientSheetTarget({ token: tk, startAdding: false })}
            >
              <IconPlus />
              <span>{tPay('addClient', { client: nounInSentence(clientNoun) })}</span>
            </button>
          ) : null}
          <span className="pos-qcard-time">{formatTime(tk.startAt)}</span>
        </div>
        {editingId === tk.id ? (
          <PickupCardEdit
            token={tk}
            onClose={() => setEditingId(null)}
            onSaved={(said) => {
              setEditingId(null);
              setQueueNote(said);
              void loadTodayTokens();
            }}
            onChanged={loadTodayTokens}
          />
        ) : (
        <>
        <ul className="pos-qcard-items">
          {tk.items.map((item, i) => (
            <li key={i} className="pos-qcard-item">
              <span className="pos-qcard-item-qty">{item.qty}×</span>
              <span className="pos-qcard-item-name">{item.name}</span>
              {canReturn ? <span className="pos-qcard-item-amt">{formatMoney(String(item.paidMinor))}</span> : null}
            </li>
          ))}
        </ul>
        <div className={`pos-qcard-foot${isPreparing ? ' is-preparing' : ''}`}>
          <div className="pos-qcard-total-row">
            {canReturn ? <span className="pos-qcard-total-label">{tk.paymentPending ? t('amountToCollect') : t('totalPaid')}</span> : null}
            {canReturn ? <strong className="pos-qcard-total">{formatMoney(String(tk.totalMinor))}</strong> : <span />}
          </div>
          {isPreparing ? (
            <div className="pos-qcard-actions">
              {/*
                Owner, 2026-11-23 — one row: Take payment, then + (Add items) beside it, and Edit and Cancel order in ⋮ — the card's
                rarer actions as words, opened inside this card, instead of two more rows of buttons on every card.
                Owner, 9 Nov 2026 — only an order still waiting for payment can grow or be called off here; a paid one is a return.
              */}
              <div className="pos-qcard-actions-row">
                <button
                  type="button"
                  className="btn pos-qcard-complete-btn"
                  onClick={() => void settleAndCompleteToken(tk)}
                >
                  <IconCheck />
                  <span>
                    {tk.paymentPending
                      ? t('takePayment', { token: tk.tokenLabel })
                      : t('handOverToken', { token: tk.tokenLabel })}
                  </span>
                </button>
                {tk.paymentPending && tk.channel === 'counter' ? (
                  <>
                    <button
                      type="button"
                      className="btn pos-qcard-plus-btn"
                      aria-label={t('addItemsTo', { token: tk.tokenLabel })}
                      title={t('addItemsTo', { token: tk.tokenLabel })}
                      onClick={() => startAddingTo(tk)}
                    >
                      <IconPlus />
                    </button>
                    <button
                      type="button"
                      className="btn pos-qcard-kebab-btn"
                      aria-label={t('moreFor', { token: tk.tokenLabel })}
                      title={t('moreFor', { token: tk.tokenLabel })}
                      aria-expanded={menuFor === tk.id}
                      aria-controls={`pos-qcard-menu-${tk.id}`}
                      onClick={() => setMenuFor((open) => (open === tk.id ? null : tk.id))}
                    >
                      <span aria-hidden="true">⋮</span>
                    </button>
                  </>
                ) : null}
              </div>
              {/*
                Owner, 2026-11-23 — the ⋮'s choices open INSIDE the card, under its buttons: a menu floating over the card below read
                as that card's, and a "Cancel order" there could be tapped for the wrong order.
              */}
              {menuFor === tk.id && tk.paymentPending && tk.channel === 'counter' ? (
                <div className="pos-qcard-menu" id={`pos-qcard-menu-${tk.id}`}>
                  {mayEdit ? (
                    <button
                      type="button"
                      className="pos-qcard-menu-item"
                      onClick={() => {
                        setMenuFor(null);
                        setQueueNote(null);
                        setEditingId(tk.id);
                      }}
                    >
                      {t('editOrder')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="pos-qcard-menu-item is-danger"
                    onClick={() => {
                      setMenuFor(null);
                      setCancelError(null);
                      setCancelTarget(tk);
                    }}
                  >
                    {t('cancelOrder')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost pos-qcard-recall-btn"
              onClick={() => setTokenState(tk.id, 'preparing', true)}
            >
              {t(qk('recallToQueue'))}
            </button>
          )}
        </div>
        </>
        )}
      </article>
    );
  };

  return (
    <WaiterContext.Provider value={waiter}>
    <PosTypeBarContext.Provider value={typeBar}>
    <div className={fullScreen ? 'pos-shell is-fullscreen' : tablesBar ? 'pos-shell has-type-bar' : 'pos-shell'}>
      {waiter ? (
        // Jira GRW-723 — a waiter's bar: which branch, and the printer for the kitchen's slip. Nothing of the counter's.
        <div className="pos-bar pos-bar-minimal">
          <div className="pos-bar-right">
            <div className="pos-bar-branch">
              <HeaderBranchPicker variant="pill" />
              <HeaderBranchPicker variant="line" />
            </div>
            <PrinterButton printer={printer} />
          </div>
        </div>
      ) : tablesBar ? (
        <div className="pos-bar pos-bar-types">
          {/* The till draws its Dine-in · Takeaway · Delivery switch here (PayFlow, through PosTypeBarContext). */}
          {/*
            Owner, 2026-11-23 — while items are being added to an order its type is already settled, so the switch is not
            offered. It belongs to the till hidden behind this one, and a tap on it changed that till instead.
          */}
          <div className="pos-bar-typeslot" ref={setTypeSlot} hidden={addingToToken !== null} />
          {orderQueue ? (
            <Link href="/kitchen" className="btn btn-ghost pos-bar-kitchen" aria-label={t('kitchenScreen')}>
              <IconFlame />
              <span className="pos-bar-kitchen-word">{t('kitchenScreen')}</span>
            </Link>
          ) : null}
          <div className="pos-bar-right">
            <div className="pos-bar-branch">
              <HeaderBranchPicker variant="pill" />
              <HeaderBranchPicker variant="line" />
            </div>
            {loading ? (
              <span className="pos-note" role="status">
                {t('loadingBills')}
              </span>
            ) : null}
            <PrinterButton printer={printer} />
            <button type="button" className="btn btn-ghost pos-fs-toggle" onClick={enterFullScreen}>
              {t('fullScreen')}
            </button>
          </div>
          {/* Return is a rare job: a word in the ⋮, not a tab on every screen. */}
          <MenuKebab
            className="pos-bar-more"
            label={t('more')}
            items={[
              ...(canReturn ? [{ label: t('returnBill'), onSelect: () => void openReturn() }] : []),
              ...(narrow ? [{ label: t('printerMenu'), onSelect: () => setPrinterOpen(true) }] : []),
              {
                label: soundOn ? t('soundWhenPaidOn') : t('soundWhenPaidOff'),
                onSelect: () => {
                  remember(SOUND_KEY, soundOn ? 'off' : 'on');
                  setSoundOn(!soundOn);
                },
              },
            ]}
          />
          {printerOpen ? <PrinterSheet printer={printer} onClose={() => setPrinterOpen(false)} /> : null}
        </div>
      ) : fullScreen ? (
        <header className="pos-fs-bar">
          <div className="pos-fs-left">
            {/*
              The till's own Back. The flow underneath draws no header of its own (`hideHead`), and full screen has
              no sidebar either, so without this the arrow that returns to whatever opened the till — the shelf, the
              sales list — existed nowhere on the screen.
            */}
            <button type="button" className="pos-fs-back" aria-label={tc('back')} onClick={() => leaveRef.current?.()}>
              <IconArrowLeft />
            </button>
            <span className="pos-fs-brand">
              <span className="pos-fs-logo" aria-hidden="true">G</span>
              {/* i18n-ok: brand name */}Growza
            </span>
            <div className="pos-fs-branch">
              <HeaderBranchPicker variant="pill" />
            </div>
          </div>
          <div className="pos-fs-shortcuts" aria-hidden="true">
            <span className="pos-kbd-pill"><kbd>F2</kbd> {t('shortcutSearch')}</span>
            <span className="pos-kbd-pill"><kbd>F4</kbd> {t('shortcutClient', { customer: Customer })}</span>
            <span className="pos-kbd-pill"><kbd>F8</kbd> {t('shortcutCharge')}</span>
            <span className="pos-kbd-pill"><kbd>F9</kbd> {t('shortcutHold')}</span>
            <span className="pos-kbd-pill"><kbd>{/* i18n-ok: keyboard keycap */}Esc</kbd> {t('shortcutExit')}</span>
          </div>
          <div className="pos-fs-actions">
            <button
              type="button"
              className={`pos-fs-btn${mode === 'sell' ? ' is-active' : ''}`}
              onClick={closeReturn}
            >
              {t('sell')}
            </button>
            {orderQueue ? (
              <button
                type="button"
                className={`pos-fs-btn${mode === 'queue' ? ' is-active' : ''}`}
                onClick={openQueue}
              >
                {t(qk('openQueue'), { count: preparingTokens.length })}
              </button>
            ) : null}
            {canReturn ? (
              <button
                type="button"
                className={`pos-fs-btn${mode === 'return' ? ' is-active' : ''}`}
                onClick={() => (mode === 'return' ? closeReturn() : void openReturn())}
              >
                {t('return')}
              </button>
            ) : null}
            <Link href="/orders" className="pos-fs-btn">
              {t('orders')}
            </Link>
            <button type="button" className="pos-fs-btn pos-fs-exit" onClick={exitFullScreen}>
              {t('exitFullScreen')}
            </button>
          </div>
        </header>
      ) : canReturn ? (
        <div className="pos-bar">
          <button type="button" className="pos-bar-back" aria-label={tc('back')} onClick={() => leaveRef.current?.()}>
            <IconArrowLeft />
          </button>
          <div className="page-tabs pos-tabs" role="tablist" aria-label={t('modes')}>
            <button type="button" role="tab" aria-selected={mode === 'sell'} className={`page-tab${mode === 'sell' ? ' active' : ''}`} onClick={closeReturn}>
              {t('sell')}
            </button>
            {orderQueue ? (
              <button type="button" role="tab" aria-selected={mode === 'queue'} className={`page-tab pos-tab-queue${mode === 'queue' ? ' active' : ''}`} onClick={openQueue}>
                <span>{t(qk('queue'))}</span>{' '}
                <span className={`pos-tab-badge${preparingTokens.length > 0 ? ' is-live' : ''}`}>{preparingTokens.length}</span>
              </button>
            ) : null}
            <button type="button" role="tab" aria-selected={mode === 'return'} className={`page-tab${mode === 'return' ? ' active' : ''}`} onClick={() => mode !== 'return' && void openReturn()}>
              {t('return')}
            </button>
          </div>
          {/*
            Jira GRW-714 — the kitchen screen, for a counter with no kitchen tablet. Owner, 17 Nov 2026 — on the tabs' own
            row (a flame, its word on a wider screen), not a row of its own under them on a phone.
          */}
          {orderQueue ? (
            <Link href="/kitchen" className="btn btn-ghost pos-bar-kitchen" aria-label={t('kitchenScreen')}>
              <IconFlame />
              <span className="pos-bar-kitchen-word">{t('kitchenScreen')}</span>
            </Link>
          ) : null}
          <div className="pos-bar-right">
            {/*
              Which branch this till is selling at. The flow underneath draws no header here (`hideHead`), so
              without this a business with more than one branch had no branch control on the till at all — and
              the branch decides the shelf, the prices and whose takings the sale lands in. Both variants, as
              every other header does: CSS shows the pill on a laptop and the line on a phone, where this row
              is otherwise empty. A single-branch business sees nothing, as everywhere else.
            */}
            <div className="pos-bar-branch">
              <HeaderBranchPicker variant="pill" />
              <HeaderBranchPicker variant="line" />
            </div>
            {loading ? (
              <span className="pos-note" role="status">
                {t('loadingBills')}
              </span>
            ) : null}
            <div className="pos-bar-shortcuts" aria-hidden="true">
              <span className="pos-kbd-inline"><kbd>F2</kbd> {t('shortcutSearch')}</span>
              <span className="pos-kbd-inline"><kbd>F4</kbd> {t('shortcutClient', { customer: Customer })}</span>
              <span className="pos-kbd-inline"><kbd>F8</kbd> {t('shortcutCharge')}</span>
              <span className="pos-kbd-inline"><kbd>F9</kbd> {t('shortcutHold')}</span>
            </div>
            <PrinterButton printer={printer} />
            <button type="button" className="btn btn-ghost pos-fs-toggle" onClick={enterFullScreen}>
              {t('fullScreen')}
            </button>
          </div>
        </div>
      ) : (
        <div className="pos-bar pos-bar-minimal">
          <button type="button" className="pos-bar-back" aria-label={tc('back')} onClick={() => leaveRef.current?.()}>
            <IconArrowLeft />
          </button>
          <div className="page-tabs pos-tabs" role="tablist" aria-label={t('modes')}>
            <button type="button" role="tab" aria-selected={mode === 'sell'} className={`page-tab${mode === 'sell' ? ' active' : ''}`} onClick={closeReturn}>
              {t('sell')}
            </button>
            {orderQueue ? (
              <button type="button" role="tab" aria-selected={mode === 'queue'} className={`page-tab pos-tab-queue${mode === 'queue' ? ' active' : ''}`} onClick={openQueue}>
                <span>{t(qk('queue'))}</span>{' '}
                <span className={`pos-tab-badge${preparingTokens.length > 0 ? ' is-live' : ''}`}>{preparingTokens.length}</span>
              </button>
            ) : null}
          </div>
          {orderQueue ? (
            <Link href="/kitchen" className="btn btn-ghost pos-bar-kitchen" aria-label={t('kitchenScreen')}>
              <IconFlame />
              <span className="pos-bar-kitchen-word">{t('kitchenScreen')}</span>
            </Link>
          ) : null}
          <div className="pos-bar-right">
            {/* As above: the till's branch, since the flow underneath draws no header of its own. */}
            <div className="pos-bar-branch">
              <HeaderBranchPicker variant="pill" />
              <HeaderBranchPicker variant="line" />
            </div>
            <div className="pos-bar-shortcuts" aria-hidden="true">
              <span className="pos-kbd-inline"><kbd>F2</kbd> {t('shortcutSearch')}</span>
              <span className="pos-kbd-inline"><kbd>F4</kbd> {t('shortcutClient', { customer: Customer })}</span>
              <span className="pos-kbd-inline"><kbd>F8</kbd> {t('shortcutCharge')}</span>
              <span className="pos-kbd-inline"><kbd>F9</kbd> {t('shortcutHold')}</span>
            </div>
            <PrinterButton printer={printer} />
            <button type="button" className="btn btn-ghost pos-fs-toggle" onClick={enterFullScreen}>
              {t('fullScreen')}
            </button>
          </div>
        </div>
      )}

      {pickupSwitch}

      {failed ? (
        <div className="pos-fail" role="alert">
          <span>{t('billsFailed')}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void openReturn()}>
            {t('tryAgain')}
          </button>
        </div>
      ) : null}

      {/*
        Owner, 9 Nov 2026 — the Sell till stays mounted, bill and all, while "Add items" uses a till of its own. It
        used to be one till re-keyed for adding, which threw away a bill the desk had half rung up — and an empty one
        came back after. Hidden, the Sell till answers no shortcut and no scanner (`inactive`), and hands the bar's
        Back arrow to the adding till while that one is up.
      */}
      {/* Jira GRW-745 FR-08 — in Return the till's Dine-in / Takeaway / Delivery switch is not shown: a return keeps its bill's type. */}
      <div className="pos-body" data-mode={mode} hidden={mode === 'queue' || addingToToken !== null || payingTable !== null}>
        <SellProductClient
          timezone={timezone}
          backTo={backTo}
          hideHead
          leaveRef={addingToToken ? undefined : leaveRef}
          inactive={mode === 'queue' || addingToToken !== null || payingTable !== null}
          onPayTable={(bill) => void payTable(bill)}
          heading={heading}
          nextTokenNo={nextTokenNo}
          onSaleCompleted={handleSaleCompleted}
          onOpenQueue={orderQueue ? () => openQueue(lastQueuedIdRef.current ?? undefined) : undefined}
          reloadKey={reloadKey}
        />
      </div>
      {addingToToken ? (
        <div className="pos-body" hidden={mode === 'queue' || payingTable !== null}>
          <SellProductClient
            key={`add-${addingToToken.id}`}
            addingTo={{
              tokenLabel: addingToToken.tokenLabel,
              onAdd: async (products) => {
                const res = await api.addToPendingCounterSale(addingToToken.id, products);
                const tk = addingToToken;
                // Jira GRW-713 — a KOT for what was just added, and nothing the kitchen already has.
                // Jira GRW-733 — one slip per station the new dishes go to.
                const added = slipsOf(res);
                if (added) {
                  const order = { tokenNo: tk.tokenNo, offlineToken: tk.offlineToken, channel: tk.channel };
                  setLastKot({ saleId: tk.id, kot: added, order });
                  printer.autoKot(added, order);
                }
                setQueueNote(t('addedToOrder', { token: tk.tokenLabel, amount: formatMoney(String(res.totalMinor)) }));
                setReloadKey((k) => k + 1);
                openQueue(tk.id);
              },
              onStop: () => openQueue(addingToToken.id),
            }}
            inactive={mode === 'queue' || payingTable !== null}
            timezone={timezone}
            backTo={backTo}
            hideHead
            leaveRef={leaveRef}
            heading={heading}
            nextTokenNo={nextTokenNo}
            onSaleCompleted={handleSaleCompleted}
            onOpenQueue={() => openQueue(addingToToken.id)}
            reloadKey={reloadKey}
          />
        </div>
      ) : null}

      {mode === 'queue' || payingTable !== null ? (
        settledReceipt ? (
          <PaymentDone
            appointmentId={settledReceipt.appointmentId}
            fixHref={null}
            totalMinor={settledReceipt.totalMinor}
            mode={settledReceipt.mode}
            modeLabel={settledReceipt.modeLabel}
            summary={settledReceipt.summary}
            bill={settledReceipt.bill}
            phone={settledReceipt.phone}
            nextLabel={payingTable !== null ? t('backToTablesDone') : t(qk('backToQueueDone'))}
            onNextCustomer={() => {
              setSettledReceipt(null);
              setPayingTable(null);
            }}
            onDone={() => {
              setSettledReceipt(null);
              setPayingTable(null);
            }}
            printSlot={
              <TillPrintActions printer={printer} saleId={settledReceipt.appointmentId} kitchen={orderQueue} order={{ tokenNo: null, channel: 'counter' }} bill={!waiter} />
            }
          />
        ) : payingToken ? (
          <QueueTokenPayScreen
            token={payingToken}
            paymentQr={paymentQr}
            saving={settlingMode}
            error={settleError}
            walkInGuestLabel={t('walkInGuest')}
            clientNoun={clientNoun}
            onOpenClientSheet={(startAdding) => setClientSheetTarget({ token: payingToken, startAdding })}
            onBack={() => {
              setPayingToken(null);
              setClientSheetTarget(null);
              setGuestSkippedFor(null);
              setSettleError(null);
              setPayingTable(null);
            }}
            byNameOnly={waiter}
            guestSkipped={guestSkippedFor === payingToken.id}
            // A waiter prints no bill (owner decision 2026-11-16), so it is never told to print one again.
            {...(waiter ? {} : { onPrintAgain: (held: { couponCode?: string; discountMinor?: number }) => printer.printBill(payingToken.id, true, held) })}
            onSettle={(ways, redeemPoints, billOff, guestName) =>
              void (async () => {
                // A waiter's walk-in: the typed name goes on the bill first, as the table's sheet did (owner, 4 Nov 2026).
                if (guestName) {
                  try {
                    await api.assignClientToSale(payingToken.id, { name: guestName });
                  } catch (e) {
                    setSettleError(e instanceof ApiError ? e.message : t('tablePayFailed'));
                    return;
                  }
                }
                await settleAndCompleteToken(guestName ? { ...payingToken, customerName: guestName } : payingToken, ways, redeemPoints, billOff);
              })()
            }
          />
        ) : (
        <section className="pos-queue-board" aria-label={t(qk('queue'))}>
          {/* Owner, 2026-11-16 — Print kitchen slip for what was just added or called off, right where it happened. */}
          {lastKot ? <TillPrintActions printer={printer} saleId={lastKot.saleId} kot={lastKot.kot} order={lastKot.order} /> : null}
          {queueNote ? (
            <div className="pos-queue-note" role="status">
              <IconCheck />
              <span>{queueNote}</span>
              <button type="button" className="pos-queue-note-close" aria-label={tc('close')} onClick={() => setQueueNote(null)}>
                <IconClose />
              </button>
            </div>
          ) : null}
          <div className="pos-queue-cols">
            <div className="pos-queue-col">
              <header className="pos-queue-col-head">
                <h2 className="pos-queue-col-title">
                  <span className="pos-queue-dot is-preparing" aria-hidden="true" />
                  {t(qk('preparingColTitle'))}
                  {/* With the one-row bar the Pickup tab right above already carries this number: said once, not twice. */}
                  {tablesBar ? null : <span className="pos-queue-col-count">{preparingTokens.length}</span>}
                </h2>
                {/* With the one-row bar, New order is the switch right above: not a second button for it here. */}
                {tablesBar ? null : (
                  <button type="button" className="btn btn-primary pos-queue-new-btn" onClick={closeReturn}>
                    + {t('backToSell')} ({formatTokenNo(nextTokenNo)})
                  </button>
                )}
              </header>
              {preparingTokens.length === 0 ? (
                <div className="pos-queue-empty">
                  <p>{t('emptyPreparing')}</p>
                </div>
              ) : (
                <div className="pos-queue-list">
                  {preparingTokens.map((tk, idx) => renderTokenCard(tk, true, idx === 0))}
                </div>
              )}
            </div>

            <div className="pos-queue-col">
              <header className="pos-queue-col-head">
                <h2 className="pos-queue-col-title">
                  <span className="pos-queue-dot is-completed" aria-hidden="true" />
                  {t('completedColTitle')}
                  <span className="pos-queue-col-count">{completedTokens.length}</span>
                </h2>
              </header>
              {completedTokens.length === 0 ? (
                <div className="pos-queue-empty">
                  <p>{t('emptyCompleted')}</p>
                </div>
              ) : (
                <div className="pos-queue-list">
                  {completedTokens.map((tk) => renderTokenCard(tk, false))}
                </div>
              )}
            </div>
          </div>
        </section>
        )
      ) : null}

      {cancelTarget ? (
        <ConfirmDialog
          tone="danger"
          title={t('cancelOrderTitle', { token: cancelTarget.tokenLabel })}
          body={t(qk('cancelOrderBody'), { amount: formatMoney(String(cancelTarget.totalMinor)) })}
          confirmLabel={t('cancelOrderConfirm')}
          cancelLabel={t('keepOrder')}
          busy={cancelBusy}
          error={cancelError}
          onConfirm={() => void cancelUnpaidOrder()}
          onCancel={() => {
            if (cancelBusy) return;
            setCancelTarget(null);
            setCancelAskCooked(false);
            setCancelCooked(undefined);
            setCancelError(null);
          }}
        >
          {cancelAskCooked ? (
            <fieldset className="tb-cooked">
              <legend className="field-hint">{tTables('cookedQuestion')}</legend>
              <div className="tb-cooked-pair">
                <button type="button" className={`btn btn-ghost ${cancelCooked === false ? 'is-on' : ''}`} aria-pressed={cancelCooked === false} onClick={() => setCancelCooked(false)}>
                  {tTables('cookedNo')}
                </button>
                <button type="button" className={`btn btn-ghost ${cancelCooked === true ? 'is-on' : ''}`} aria-pressed={cancelCooked === true} onClick={() => setCancelCooked(true)}>
                  {tTables('cookedYes')}
                </button>
              </div>
              <span className="field-hint">{tTables('cookedHint')}</span>
            </fieldset>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {clientSheetTarget ? (
        <ClientSheet
          location={location}
          nameStaysOnBill={guestOptional}
          startAdding={clientSheetTarget.startAdding}
          onPick={(c) => void attachClientToToken(clientSheetTarget.token, c)}
          onClose={() => setClientSheetTarget(null)}
          /*
           * Owner, 2026-11-22 (Jira GRW-747) — a kitchen's Pickup can skip "Who is paying?": the order is finished and
           * waiting, so it is paid as Walk-in. A name or number can still be added from its card or the order later.
           */
          {...(guestOptional && !waiter && payingToken && clientSheetTarget.token.id === payingToken.id && isWalkInToken(payingToken)
            ? {
                onSkip: () => {
                  setGuestSkippedFor(payingToken.id);
                  setClientSheetTarget(null);
                },
              }
            : {})}
        />
      ) : null}

      {mode === 'return' && bills ? (
        <ReturnProductSheet
          bills={bills}
          timezone={timezone}
          todayISO={todayISO}
          returnWindowDays={returnWindowDays}
          onClose={closeReturn}
          // The sheet keeps its own "return recorded" step on screen; refresh shelf stock and queue totals in place.
          onReturned={() => {
            setReloadKey((k) => k + 1);
            void loadTodayTokens();
          }}
        />
      ) : null}
    </div>
    </PosTypeBarContext.Provider>
    </WaiterContext.Provider>
  );
}
