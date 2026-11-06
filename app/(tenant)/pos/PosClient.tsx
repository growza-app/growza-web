'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '../../shared/AppLink';
import { api, formatMoney, type Appointment } from '../lib/api';
import type { PaymentMode } from '../lib/api-types';
import { HeaderBranchPicker } from '../components/HeaderBranchPicker';
import { useBranch } from '../components/BranchProvider';
import { useLabel } from '../components/LabelsProvider';
import { PaymentDone } from '../components/PaymentDone';
import { RedeemRow } from '../components/RedeemRow';
import { useSession } from '../components/SessionProvider';
import { IconCheck, IconArrowLeft, IconClose, IconPayCard, IconPayCash, IconPayOther, IconPayUpi, IconPlus, IconSearch } from '../components/icons';
import { ClientSheet, type PickedClient } from '../appointments/new/ClientSheet';
import { Keypad } from '../appointments/new/Keypad';
import { formatDate } from '../lib/format';
import { displayPhone } from '../lib/phone';
import { nounInSentence, pickNoun } from '../lib/nouns';
import { receiptRows, type ReceiptRow } from '../lib/receipt-text';
import { useNewVisitCopy } from '../lib/use-copy';
import { useRewardQuote } from '../lib/use-reward-quote';
import { SellProductClient } from '../products/sell/SellProductClient';
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
}: {
  token: PosDailyToken;
  paymentQr: string | null;
  saving: PaymentMode | null;
  error: string | null;
  walkInGuestLabel: string;
  clientNoun: string;
  onOpenClientSheet: (startAdding: boolean) => void;
  onBack: () => void;
  onSettle: (ways: Array<{ mode: PaymentMode; amountMinor: number }>, redeemPoints: number) => void;
}) {
  const tPay = useTranslations('payFlow');
  const tc = useTranslations('chrome');
  const nv = useNewVisitCopy();
  const anonymous = isWalkInToken(token);
  const guestLabel = anonymous ? walkInGuestLabel : (token.customerName || walkInGuestLabel);
  const { rewards, usePoints, toggle: toggleRedeem, redeemPoints, redeemMinor: discountMinor } = useRewardQuote(
    token.customerId,
    token.totalMinor,
  );
  const dueMinor = Math.max(0, token.totalMinor - discountMinor);

  const [qrStep, setQrStep] = useState(false);
  const [qrBroken, setQrBroken] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitKeypad, setSplitKeypad] = useState<PaymentMode | null>(null);
  const [splitAmount, setSplitAmount] = useState('');
  const [firstWay, setFirstWay] = useState<{ mode: PaymentMode; minor: number } | null>(null);

  const money = (minor: number) => formatMoney(String(minor));
  const modeWord = (mode: PaymentMode) => tc(`pay.${mode}`);
  const clearSplit = () => {
    setSplitting(false);
    setSplitKeypad(null);
    setSplitAmount('');
    setFirstWay(null);
  };
  const handleToggleRedeem = () => {
    clearSplit();
    toggleRedeem();
  };
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
          {tPay('rewards.wasOff', { bill: money(token.totalMinor), amount: money(discountMinor) })}
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
          onClick={() => onSettle(waysFor('upi'), redeemPoints)}
          disabled={saving !== null}
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
        {!anonymous ? (
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
      {!anonymous ? (
        <RedeemRow rewards={rewards} usePoints={usePoints} onToggle={handleToggleRedeem} disabled={saving !== null} />
      ) : null}
      {error ? (
        <div role="alert" className="pf-error">
          {error}
        </div>
      ) : null}
      {!anonymous ? (
        <>
          <div className="pf-pay" role="group" aria-label={tPay('howTitle')}>
            {firstWay ? (
              <p className="pf-split-held" role="status">
                <span>
                  {tPay('split.then', {
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
                disabled={saving !== null || firstWay?.mode === m}
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
                  onSettle(waysFor(m), redeemPoints);
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
              onSettle([{ mode, amountMinor: dueMinor }], redeemPoints);
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
  initialMode,
  initialToken,
  heading,
  backTo,
}: {
  timezone: string;
  todayISO: string;
  returnWindowDays: number;
  canReturn: boolean;
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
  const nv = useNewVisitCopy();
  const locale = useLocale();
  const { Customer } = useNouns();
  const clientNoun = pickNoun(locale, useLabel('customer', 'Client'), tNouns('customer'));
  const productsNoun = useLabel('products', 'Products');
  const providerNoun = useLabel('provider', 'Staff member');
  const branch = useBranch();
  const session = useSession();
  const location = branch.choice ?? branch.one ?? session?.branches?.[0]?.id ?? null;
  const paymentQr =
    branch.branches.find((b) => b.id === location)?.paymentQrUrl ??
    session?.branches?.find((b) => b.id === location)?.paymentQrUrl ??
    null;

  const [mode, setMode] = useState<PosMode>(initialMode === 'queue' ? 'queue' : 'sell');
  const [fullScreen, setFullScreen] = useState(false);
  const [bills, setBills] = useState<SaleRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Today's raw appointments/sales for daily token generation and live queue tracking. */
  const [todayRows, setTodayRows] = useState<Appointment[]>([]);
  const [tokenOverrides, setTokenOverrides] = useState<Record<string, PosTokenOverride>>({});
  const [payingToken, setPayingToken] = useState<PosDailyToken | null>(null);
  const [clientSheetTarget, setClientSheetTarget] = useState<{ token: PosDailyToken; startAdding: boolean } | null>(null);
  const [settlingMode, setSettlingMode] = useState<PaymentMode | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);
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
      const rows = await api.appointments(todayISO, todayISO, undefined, undefined, {
        includeSales: true,
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
  const nextTokenNo = dailyTokens.length + 1;

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
                  customerName: nextName,
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

  const settleAndCompleteToken = useCallback(
    async (
      tk: PosDailyToken,
      ways?: Array<{ mode: PaymentMode; amountMinor: number }>,
      redeemPoints = 0,
    ) => {
      if (!tk.paymentPending) {
        setTokenState(tk.id, 'completed');
        return;
      }
      if (!ways || ways.length === 0) {
        setSettleError(null);
        setPayingToken(tk);
        if (isWalkInToken(tk) && tk.channel === 'counter') {
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
            adjustMinor: 0,
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
            nv.token(tk.tokenNo),
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
      setBills(buildSaleRows(rows.filter((r) => !isDeliveryApp(r.channel ?? 'counter')), timezone));
    } catch {
      if (mine !== opened.current) return;
      setBills(null);
      setFailed(true);
    } finally {
      if (mine === opened.current) setLoading(false);
    }
  }, [todayISO, returnWindowDays, timezone]);

  const openQueue = useCallback(
    (targetToken?: unknown) => {
      opened.current++;
      setMode('queue');
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
    if (raw) {
      setMode('queue');
      setFocusToken(raw);
    }
  }, [initialToken]);

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
          {anonymous && tk.channel === 'counter' ? (
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
            <button
              type="button"
              className="btn pos-qcard-complete-btn"
              onClick={() => void settleAndCompleteToken(tk)}
            >
              <IconCheck />
              <span>
                {tk.paymentPending
                  ? t('selectPaymentAndComplete', { token: tk.tokenLabel })
                  : t('handOverToken', { token: tk.tokenLabel })}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost pos-qcard-recall-btn"
              onClick={() => setTokenState(tk.id, 'preparing', true)}
            >
              {t('recallToQueue')}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className={fullScreen ? 'pos-shell is-fullscreen' : 'pos-shell'}>
      {fullScreen ? (
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
            <button
              type="button"
              className={`pos-fs-btn${mode === 'queue' ? ' is-active' : ''}`}
              onClick={openQueue}
            >
              {t('openQueue', { count: preparingTokens.length })}
            </button>
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
            <button type="button" role="tab" aria-selected={mode === 'queue'} className={`page-tab pos-tab-queue${mode === 'queue' ? ' active' : ''}`} onClick={openQueue}>
              <span>{t('queue')}</span>{' '}
              <span className={`pos-tab-badge${preparingTokens.length > 0 ? ' is-live' : ''}`}>{preparingTokens.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={mode === 'return'} className={`page-tab${mode === 'return' ? ' active' : ''}`} onClick={() => mode !== 'return' && void openReturn()}>
              {t('return')}
            </button>
          </div>
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
            <button type="button" role="tab" aria-selected={mode === 'queue'} className={`page-tab pos-tab-queue${mode === 'queue' ? ' active' : ''}`} onClick={openQueue}>
              <span>{t('queue')}</span>{' '}
              <span className={`pos-tab-badge${preparingTokens.length > 0 ? ' is-live' : ''}`}>{preparingTokens.length}</span>
            </button>
          </div>
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
            <button type="button" className="btn btn-ghost pos-fs-toggle" onClick={enterFullScreen}>
              {t('fullScreen')}
            </button>
          </div>
        </div>
      )}

      {failed ? (
        <div className="pos-fail" role="alert">
          <span>{t('billsFailed')}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void openReturn()}>
            {t('tryAgain')}
          </button>
        </div>
      ) : null}

      <div className="pos-body" hidden={mode === 'queue'}>
        <SellProductClient
          timezone={timezone}
          backTo={backTo}
          hideHead
          leaveRef={leaveRef}
          heading={heading}
          nextTokenNo={nextTokenNo}
          onSaleCompleted={handleSaleCompleted}
          onOpenQueue={() => openQueue(lastQueuedIdRef.current ?? undefined)}
          reloadKey={reloadKey}
        />
      </div>

      {mode === 'queue' ? (
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
            nextLabel={t('backToQueueDone')}
            onNextCustomer={() => setSettledReceipt(null)}
            onDone={() => setSettledReceipt(null)}
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
              setSettleError(null);
            }}
            onSettle={(ways, redeemPoints) => void settleAndCompleteToken(payingToken, ways, redeemPoints)}
          />
        ) : (
        <section className="pos-queue-board" aria-label={t('queue')}>
          <div className="pos-queue-cols">
            <div className="pos-queue-col">
              <header className="pos-queue-col-head">
                <h2 className="pos-queue-col-title">
                  <span className="pos-queue-dot is-preparing" aria-hidden="true" />
                  {t('preparingColTitle')}
                  <span className="pos-queue-col-count">{preparingTokens.length}</span>
                </h2>
                <button type="button" className="btn btn-primary pos-queue-new-btn" onClick={closeReturn}>
                  + {t('backToSell')} ({formatTokenNo(nextTokenNo)})
                </button>
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

      {clientSheetTarget ? (
        <ClientSheet
          location={location}
          startAdding={clientSheetTarget.startAdding}
          onPick={(c) => void attachClientToToken(clientSheetTarget.token, c)}
          onClose={() => setClientSheetTarget(null)}
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
  );
}
