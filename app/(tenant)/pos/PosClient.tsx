'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from '../../shared/AppLink';
import { api, type Appointment } from '../lib/api';
import { HeaderBranchPicker } from '../components/HeaderBranchPicker';
import { SellProductClient } from '../products/sell/SellProductClient';
import { buildSaleRows, type SaleRow } from '../sales/SalesClient';
import { ReturnProductSheet } from '../sales/ReturnProductSheet';
import { returnLookbackFrom, type PosMode } from './pos-helpers';
import { useNouns } from '../lib/use-nouns';

/**
 * The POS tab: the till, and the way a product comes back onto the shelf, on one screen.
 *
 * ## Sell
 * Is the till that already existed (`/products/sell`, `PayFlow` with `productsOnly`) and stays mounted under everything
 * else, so a return taken in the middle of a sale never costs the person at the counter their cart. The sale ends the
 * way it always did: Send on WhatsApp, Print, and the GST invoice (`DocumentAction`) — nothing is rebuilt here.
 *
 * ## Return
 * Is the return sheet the Sales register uses, with its own finder (scan a product, a bill number, a client's name or
 * phone) and its own rules (return window, owner override, restock or damaged, refund mode, the issued-invoice
 * warning). It is opened from here instead of from a row in the register, so a person who stands at the counter does
 * not have to go and find the bill in a list of the day's takings first.
 *
 * The bills are read when Return is OPENED, not when POS is, because Sell is the screen used all day and most
 * visits never take a return; and again on every open, because the sale just rung up is the one most likely to come
 * straight back.
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
  const { Customer } = useNouns();
  const [mode, setMode] = useState<PosMode>('sell');
  const [fullScreen, setFullScreen] = useState(false);
  const [bills, setBills] = useState<SaleRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Only the latest open may answer: a slow read from an earlier open must not put old bills under a newer sheet. */
  const opened = useRef(0);

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
      setBills(buildSaleRows(rows, timezone));
    } catch {
      if (mine !== opened.current) return;
      setBills(null);
      setFailed(true);
    } finally {
      if (mine === opened.current) setLoading(false);
    }
  }, [todayISO, returnWindowDays, timezone]);

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
      )}

      {failed ? (
        <div className="pos-fail" role="alert">
          <span>{t('billsFailed')}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void openReturn()}>
            {t('tryAgain')}
          </button>
        </div>
      ) : null}

      <div className="pos-body">
        <SellProductClient timezone={timezone} backTo={backTo} heading={heading} />
      </div>

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
