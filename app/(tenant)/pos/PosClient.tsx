'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, type Appointment } from '../lib/api';
import { SellProductClient } from '../products/sell/SellProductClient';
import { buildSaleRows, type SaleRow } from '../sales/SalesClient';
import { ReturnProductSheet } from '../sales/ReturnProductSheet';
import { returnLookbackFrom, type PosMode } from './pos-helpers';

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
  const [mode, setMode] = useState<PosMode>('sell');
  const [bills, setBills] = useState<SaleRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Only the latest open may answer: a slow read from an earlier open must not put old bills under a newer sheet. */
  const opened = useRef(0);

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
    <>
      {canReturn ? (
        <div className="pos-bar">
          <div className="page-tabs pos-tabs" role="tablist" aria-label={t('modes')}>
            <button type="button" role="tab" aria-selected={mode === 'sell'} className={`page-tab${mode === 'sell' ? ' active' : ''}`} onClick={closeReturn}>
              {t('sell')}
            </button>
            <button type="button" role="tab" aria-selected={mode === 'return'} className={`page-tab${mode === 'return' ? ' active' : ''}`} onClick={() => mode !== 'return' && void openReturn()}>
              {t('return')}
            </button>
          </div>
          {loading ? (
            <span className="pos-note" role="status">
              {t('loadingBills')}
            </span>
          ) : null}
        </div>
      ) : null}

      {failed ? (
        <div className="pos-fail" role="alert">
          <span>{t('billsFailed')}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void openReturn()}>
            {t('tryAgain')}
          </button>
        </div>
      ) : null}

      <SellProductClient timezone={timezone} backTo={backTo} heading={heading} />

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
    </>
  );
}
