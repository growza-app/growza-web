'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '../../shared/AppLink';
import { api, formatMoney, type Appointment } from '../lib/api';
import { HeaderBranchPicker } from '../components/HeaderBranchPicker';
import { useBranch } from '../components/BranchProvider';
import { useSession } from '../components/SessionProvider';
import { IconCheck } from '../components/icons';
import { SellProductClient } from '../products/sell/SellProductClient';
import { buildSaleRows, type SaleRow } from '../sales/SalesClient';
import { ReturnProductSheet } from '../sales/ReturnProductSheet';
import {
  buildDailyTokens,
  formatTokenNo,
  posQueueStorageKey,
  returnLookbackFrom,
  type PosDailyToken,
  type PosMode,
  type PosTokenState,
} from './pos-helpers';
import { useNouns } from '../lib/use-nouns';
import { isDeliveryApp } from '../lib/order-channels';

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
  heading,
  backTo,
}: {
  timezone: string;
  todayISO: string;
  returnWindowDays: number;
  canReturn: boolean;
  initialMode: PosMode;
  /** A shop's name for the till. Absent is "Sell product". */
  heading?: string;
  backTo?: '/products' | '/sales';
}) {
  const t = useTranslations('pos');
  const locale = useLocale();
  const { Customer } = useNouns();
  const branch = useBranch();
  const session = useSession();
  const location = branch.choice ?? branch.one ?? session?.branches?.[0]?.id ?? null;

  const [mode, setMode] = useState<PosMode>(initialMode === 'queue' ? 'queue' : 'sell');
  const [fullScreen, setFullScreen] = useState(false);
  const [bills, setBills] = useState<SaleRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Today's raw appointments/sales for daily token generation and live queue tracking. */
  const [todayRows, setTodayRows] = useState<Appointment[]>([]);
  const [tokenOverrides, setTokenOverrides] = useState<Record<string, PosTokenState>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  /** Only the latest open may answer: a slow read from an earlier open must not put old bills under a newer sheet. */
  const opened = useRef(0);

  const storageKey = posQueueStorageKey(location, todayISO);

  // Load persisted token state overrides for today and this branch
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, PosTokenState>;
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
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadTodayTokens]);

  const setTokenState = useCallback(
    (visitId: string, state: PosTokenState) => {
      setTokenOverrides((prev) => {
        const next = { ...prev, [visitId]: state };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
        return next;
      });
    },
    [storageKey],
  );

  const handleSaleCompleted = useCallback(
    (saleId: string) => {
      setTokenState(saleId, 'preparing');
      void loadTodayTokens();
    },
    [setTokenState, loadTodayTokens],
  );

  const dailyTokens = useMemo(
    () => buildDailyTokens(todayRows, location, tokenOverrides, nowMs),
    [todayRows, location, tokenOverrides, nowMs],
  );
  const preparingTokens = useMemo(() => dailyTokens.filter((tk) => tk.state === 'preparing'), [dailyTokens]);
  const completedTokens = useMemo(
    () => [...dailyTokens.filter((tk) => tk.state === 'completed')].reverse(),
    [dailyTokens],
  );
  const nextTokenNo = dailyTokens.length + 1;
  const lastTokenLabel = dailyTokens.length > 0 ? dailyTokens[dailyTokens.length - 1]!.tokenLabel : t('noneIssuedYet');
  const todayTotalMinor = useMemo(() => dailyTokens.reduce((sum, tk) => sum + tk.totalMinor, 0), [dailyTokens]);

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
      setBills(buildSaleRows(rows.filter((r) => !isDeliveryApp(r.channel ?? 'counter')), timezone));
    } catch {
      if (mine !== opened.current) return;
      setBills(null);
      setFailed(true);
    } finally {
      if (mine === opened.current) setLoading(false);
    }
  }, [todayISO, returnWindowDays, timezone]);

  const openQueue = useCallback(() => {
    opened.current++;
    setMode('queue');
    setLoading(false);
    setFailed(false);
    void loadTodayTokens();
  }, [loadTodayTokens]);

  const closeReturn = useCallback(() => {
    opened.current++;
    setMode('sell');
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

  const renderTokenCard = (tk: PosDailyToken, isPreparing: boolean) => {
    const guest = tk.customerName || t('walkInGuest');
    const elapsedText = tk.elapsedMin <= 0 ? t('elapsedJustNow') : t('elapsedMin', { min: tk.elapsedMin });
    return (
      <article key={tk.id} className={`pos-qcard${isPreparing ? ' is-preparing' : ' is-completed'}`}>
        <div className="pos-qcard-top">
          <div className="pos-qcard-id">
            <span className="pos-qcard-token">{tk.tokenLabel}</span>
            <span className={`pos-qcard-chan is-${tk.channel}`}>{channelLabel(tk.channel)}</span>
            <span className="pos-qcard-guest">{guest}</span>
          </div>
          <div className="pos-qcard-meta">
            <span className="pos-qcard-time">{formatTime(tk.startAt)}</span>
            {isPreparing ? (
              <span className="pos-qcard-elapsed">{elapsedText}</span>
            ) : (
              <span className="pos-qcard-done-pill">
                <IconCheck />
                {t('statusCompleted')}
              </span>
            )}
          </div>
        </div>
        <ul className="pos-qcard-items">
          {tk.items.map((item, i) => (
            <li key={i} className="pos-qcard-item">
              <span className="pos-qcard-item-qty">{item.qty}×</span>
              <span className="pos-qcard-item-name">{item.name}</span>
              <span className="pos-qcard-item-amt">{formatMoney(String(item.paidMinor))}</span>
            </li>
          ))}
        </ul>
        <div className="pos-qcard-foot">
          <strong className="pos-qcard-total">{formatMoney(String(tk.totalMinor))}</strong>
          {isPreparing ? (
            <button
              type="button"
              className="btn pos-qcard-complete-btn"
              onClick={() => setTokenState(tk.id, 'completed')}
            >
              <IconCheck />
              <span>{t('markCompleted')}</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost pos-qcard-recall-btn"
              onClick={() => setTokenState(tk.id, 'preparing')}
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
          <div className="page-tabs pos-tabs" role="tablist" aria-label={t('modes')}>
            <button type="button" role="tab" aria-selected={mode === 'sell'} className={`page-tab${mode === 'sell' ? ' active' : ''}`} onClick={closeReturn}>
              {t('sell')}
            </button>
            <button type="button" role="tab" aria-selected={mode === 'queue'} className={`page-tab pos-tab-queue${mode === 'queue' ? ' active' : ''}`} onClick={openQueue}>
              <span>{t('queue')}</span>
              <span className={`pos-tab-badge${preparingTokens.length > 0 ? ' is-live' : ''}`}>{preparingTokens.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={mode === 'return'} className={`page-tab${mode === 'return' ? ' active' : ''}`} onClick={() => mode !== 'return' && void openReturn()}>
              {t('return')}
            </button>
          </div>
          <div className="pos-bar-right">
            {loading ? (
              <span className="pos-note" role="status">
                {t('loadingBills')}
              </span>
            ) : null}
            <span className="pos-next-token-pill">
              {t('nextToken', { token: formatTokenNo(nextTokenNo) })}
            </span>
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
          <div className="page-tabs pos-tabs" role="tablist" aria-label={t('modes')}>
            <button type="button" role="tab" aria-selected={mode === 'sell'} className={`page-tab${mode === 'sell' ? ' active' : ''}`} onClick={closeReturn}>
              {t('sell')}
            </button>
            <button type="button" role="tab" aria-selected={mode === 'queue'} className={`page-tab pos-tab-queue${mode === 'queue' ? ' active' : ''}`} onClick={openQueue}>
              <span>{t('queue')}</span>
              <span className={`pos-tab-badge${preparingTokens.length > 0 ? ' is-live' : ''}`}>{preparingTokens.length}</span>
            </button>
          </div>
          <div className="pos-bar-right">
            <span className="pos-next-token-pill">
              {t('nextToken', { token: formatTokenNo(nextTokenNo) })}
            </span>
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

      {mode !== 'queue' ? (
        <section className="pos-token-strip" aria-label={t('queue')}>
          <div className="pos-token-strip-head">
            <span className="pos-token-strip-dot" aria-hidden="true" />
            <strong className="pos-token-strip-title">
              {t('inQueueLabel', { count: preparingTokens.length })}
            </strong>
          </div>
          {preparingTokens.length > 0 ? (
            <div className="pos-token-strip-list">
              {preparingTokens.map((tk) => (
                <div key={tk.id} className="pos-token-chip">
                  <span className="pos-token-chip-no">{tk.tokenLabel}</span>
                  <span className={`pos-token-chip-chan is-${tk.channel}`}>{channelLabel(tk.channel)}</span>
                  <span className="pos-token-chip-items" title={tk.itemsSummary}>
                    {tk.itemsSummary}
                  </span>
                  <span className="pos-token-chip-time">
                    {tk.elapsedMin <= 0 ? t('elapsedJustNow') : t('elapsedMinShort', { min: tk.elapsedMin })}
                  </span>
                  <button
                    type="button"
                    className="pos-token-chip-done"
                    onClick={() => setTokenState(tk.id, 'completed')}
                    aria-label={`${tk.tokenLabel} ${t('markCompleted')}`}
                  >
                    <IconCheck />
                    <span>{t('markReady')}</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="pos-token-strip-empty">
              {t('allDoneStrip', { token: formatTokenNo(nextTokenNo) })}
            </p>
          )}
          <button type="button" className="pos-token-strip-more" onClick={openQueue}>
            {t('completedLabel', { count: completedTokens.length })} →
          </button>
        </section>
      ) : null}

      <div className="pos-body" hidden={mode === 'queue'}>
        <SellProductClient
          timezone={timezone}
          backTo={backTo}
          heading={heading}
          nextTokenNo={nextTokenNo}
          onSaleCompleted={handleSaleCompleted}
        />
      </div>

      {mode === 'queue' ? (
        <section className="pos-queue-board" aria-label={t('queue')}>
          <div className="pos-queue-kpis">
            <div className="pos-queue-kpi">
              <span className="pos-queue-kpi-label">{t('kpiLastToken')}</span>
              <strong className="pos-queue-kpi-val">{lastTokenLabel}</strong>
              <span className="pos-queue-kpi-sub">{t('nextToken', { token: formatTokenNo(nextTokenNo) })}</span>
            </div>
            <div className="pos-queue-kpi is-preparing">
              <span className="pos-queue-kpi-label">{t('kpiInQueue')}</span>
              <strong className="pos-queue-kpi-val">{preparingTokens.length}</strong>
              <span className="pos-queue-kpi-sub">{t('statusPreparing')}</span>
            </div>
            <div className="pos-queue-kpi is-completed">
              <span className="pos-queue-kpi-label">{t('kpiCompletedToday')}</span>
              <strong className="pos-queue-kpi-val">{completedTokens.length}</strong>
              <span className="pos-queue-kpi-sub">{t('statusCompleted')}</span>
            </div>
            <div className="pos-queue-kpi">
              <span className="pos-queue-kpi-label">{t('kpiTotalOrders')}</span>
              <strong className="pos-queue-kpi-val">{dailyTokens.length}</strong>
              <span className="pos-queue-kpi-sub">{formatMoney(String(todayTotalMinor))}</span>
            </div>
          </div>

          <div className="pos-queue-cols">
            <div className="pos-queue-col">
              <header className="pos-queue-col-head">
                <div>
                  <h2 className="pos-queue-col-title">
                    <span className="pos-queue-dot is-preparing" aria-hidden="true" />
                    {t('preparingColTitle')}
                    <span className="pos-queue-col-count">{preparingTokens.length}</span>
                  </h2>
                  <p className="pos-queue-col-sub">{t('preparingColSub')}</p>
                </div>
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
                  {preparingTokens.map((tk) => renderTokenCard(tk, true))}
                </div>
              )}
            </div>

            <div className="pos-queue-col">
              <header className="pos-queue-col-head">
                <div>
                  <h2 className="pos-queue-col-title">
                    <span className="pos-queue-dot is-completed" aria-hidden="true" />
                    {t('completedColTitle')}
                    <span className="pos-queue-col-count">{completedTokens.length}</span>
                  </h2>
                  <p className="pos-queue-col-sub">{t('completedColSub')}</p>
                </div>
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
      ) : null}

      {mode === 'return' && bills ? (
        <ReturnProductSheet
          bills={bills}
          timezone={timezone}
          todayISO={todayISO}
          returnWindowDays={returnWindowDays}
          onClose={closeReturn}
          // The sheet keeps its own "return recorded" step on screen; the next open reads the bills again.
          onReturned={() => {}}
        />
      ) : null}
    </div>
  );
}
