'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError, formatMoney } from '../../lib/api';
import type { ExchangeBody, ExchangeResult, OrderDetail, Size } from '../../lib/api-types';
import { sizeLabel } from '../../lib/till-sizes';
import { newRequestId } from '../../sales/sales-helpers';
import { useDialog } from '../../../shared/a11y/useDialog';

type Line = OrderDetail['lines'][number];
type Mode = NonNullable<ExchangeBody['settlementMode']>;
const MODES: readonly Mode[] = ['cash', 'upi', 'card', 'other'];

/**
 * Jira GRW-617 — "Swap size": the child needs the 30, not the 28.
 *
 * One sheet, in the order the shopkeeper thinks: which size, what it costs, how that was paid, confirm. The line being
 * swapped is named at the top; the grid is the product's other sizes in the owner's order, the count under each; a size
 * with none left is shown and dimmed. The difference is NEVER worked out here: choosing a size asks the server to run the
 * whole swap and roll it back (`exchangeQuote`), and what it answers is what is shown — so the screen cannot promise a
 * price the swap will not charge, and a price that moves before the tap is caught by the server and shown again.
 *
 * The confirm bar is one full-width button at the bottom, saying what will happen in money ("Take ₹150 and swap"). Tapped
 * twice it swaps once: the request carries one id for as long as the choice is the same, and the button is held while the
 * request is out. Nothing animates (UX-08).
 */
export function SwapSizeSheet({
  order,
  line,
  isOwner,
  windowExpired,
  windowDays,
  onClose,
  onSwapped,
  onUnsure,
}: {
  order: OrderDetail;
  line: Line;
  /** May the viewer accept a swap past the window? The owner only; everyone else is told why not. */
  isOwner: boolean;
  /** Is this bill past the business's window? The screen knows from the sale's date; the server is the one that decides. */
  windowExpired: boolean;
  windowDays: number;
  onClose: () => void;
  onSwapped: (result: ExchangeResult) => void;
  /** The answer to a swap was lost, so it may have happened: the screen redraws from the server. */
  onUnsure: () => void;
}) {
  const t = useTranslations('orders.detail.swap');
  const tm = useTranslations('orders.detail.modes');
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  // Escape must not close the sheet on a swap that is out: its answer, and its error, would have nowhere to be shown.
  useDialog(ref, { onClose: () => (inFlight.current ? undefined : onClose()), initialFocus: 'container' });

  const remaining = line.qty - line.returnedQty;
  const [sizes, setSizes] = useState<Size[] | null>(null);
  // A product with two options (size and colour) is shown one colour at a time, as the till shows it. The shirt the child
  // has is the colour that is wanted, so that colour is the one the grid opens on.
  const [colours, setColours] = useState<string[]>([]);
  const [colour, setColour] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [chosen, setChosen] = useState<Size | null>(null);
  const [qty, setQty] = useState(1);
  const [quote, setQuote] = useState<ExchangeResult | null>(null);
  const [quoting, setQuoting] = useState(false);
  // No way is pre-chosen: a top-up taken by UPI must not be recorded as cash because nobody looked at the chip.
  const [mode, setMode] = useState<Mode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One request id for as long as the choice is the same: a retry after a lost answer is the same swap, not a second.
  const request = useRef<{ id: string; signature: string } | null>(null);
  // The newest quote asked for wins: a slow answer for a size the person has already moved off must not draw over it.
  const quoteSeq = useRef(0);

  const money = (minor: number): string => formatMoney(Math.abs(minor), 'INR', locale);
  const overrideWindow = windowExpired && isOwner;
  const blockedByWindow = windowExpired && !isOwner;

  const loadSizes = useCallback(async () => {
    setLoadFailed(false);
    try {
      const all = await api.productSizes(line.productId!);
      const live = all.variants.filter((v) => v.active);
      const second = all.axes[1];
      const used = new Set(live.map((v) => (v.option2 ?? '').toLowerCase()));
      const offered = second ? second.values.filter((v) => used.has(v.toLowerCase())) : [];
      setColours(offered);
      setColour((now) => {
        if (now !== null) return now;
        // The colour the child has, when it can still be chosen; else the first colour that has a size to swap to.
        const mine = all.variants.find((v) => v.id === line.variantId)?.option2;
        return mine && offered.some((o) => o.toLowerCase() === mine.toLowerCase()) ? mine : (offered[0] ?? null);
      });
      setSizes(live.filter((v) => v.id !== line.variantId));
    } catch {
      setLoadFailed(true);
    }
  }, [line.productId, line.variantId]);
  useEffect(() => {
    void loadSizes();
  }, [loadSizes]);

  const body = useCallback(
    (size: Size, count: number): ExchangeBody => ({
      lineId: line.id,
      toVariantId: size.id,
      qty: count,
      // A quote is only asked for the number; the document and the window are decided again at the swap itself.
      acknowledgeIssuedDocument: true,
      ...(overrideWindow ? { overrideReturnWindow: true } : {}),
    }),
    [line.id, overrideWindow],
  );

  const ask = useCallback(
    async (size: Size, count: number) => {
      const seq = ++quoteSeq.current;
      setQuoting(true);
      setQuote(null);
      setNotice(null);
      try {
        const q = await api.exchangeQuote(order.id, body(size, count));
        if (seq === quoteSeq.current) setQuote(q);
      } catch (error) {
        if (seq !== quoteSeq.current) return;
        if (error instanceof ApiError && error.code === 'size_unavailable') {
          setNotice(t('sizeGone'));
          setChosen(null);
          void loadSizes();
        } else {
          setNotice(error instanceof ApiError ? error.message : t('failed'));
        }
      } finally {
        if (seq === quoteSeq.current) setQuoting(false);
      }
    },
    [order.id, body, loadSizes, t],
  );

  const choose = (size: Size) => {
    if (busy || size.stock <= 0 || blockedByWindow) return;
    setChosen(size);
    setDocumentNumber(null);
    void ask(size, qty);
  };
  const setCount = (count: number) => {
    const next = Math.min(remaining, Math.max(1, count));
    setQty(next);
    if (chosen) void ask(chosen, next);
  };

  const difference = quote?.differenceMinor ?? 0;
  const settled = quote !== null && (difference === 0 || mode !== null);
  const canConfirm = chosen !== null && quote !== null && !quoting && !busy && settled && !blockedByWindow;

  const confirm = async (acknowledge = false) => {
    if (!chosen || !quote || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    const signature = JSON.stringify({
      line: line.id,
      to: chosen.id,
      qty,
      difference,
      mode: difference === 0 ? null : mode,
    });
    if (request.current?.signature !== signature) request.current = { id: `swap-${newRequestId()}`, signature };
    try {
      const result = await api.exchangeOrder(order.id, {
        ...body(chosen, qty),
        acknowledgeIssuedDocument: acknowledge || undefined,
        ...(difference === 0 ? {} : { settlementMode: mode! }),
        expectedDifferenceMinor: difference,
        idempotencyKey: request.current.id,
      });
      request.current = null;
      onSwapped(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'document_issued') {
        const number = (error.body as { documentNumber?: unknown } | undefined)?.documentNumber;
        setDocumentNumber(typeof number === 'string' ? number : '');
      } else if (error instanceof ApiError && error.code === 'exchange_difference_changed') {
        // The price moved between the quote and the tap: show the amount it is now and let the person decide again.
        const now = (error.body as { differenceMinor?: unknown } | undefined)?.differenceMinor;
        if (typeof now === 'number' && quote) setQuote({ ...quote, differenceMinor: now });
        setNotice(t('priceMoved'));
      } else if (error instanceof ApiError && error.code === 'size_unavailable') {
        setNotice(t('sizeGone'));
        setChosen(null);
        setQuote(null);
        void loadSizes();
      } else if (!(error instanceof ApiError) || error.status >= 500) {
        // No answer, or a server fault: the swap may have gone through. Say so, and redraw from the server instead of
        // inviting a second swap of units that are already swapped.
        setNotice(t('unsure'));
        onUnsure();
      } else {
        setNotice(error.message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // One colour at a time when a product has two options; a colour with no other size says so instead of showing a blank grid.
  const visible = (sizes ?? []).filter((s) => colour === null || colours.length < 2 || (s.option2 ?? '').toLowerCase() === colour.toLowerCase());

  const confirmLabel = !chosen
    ? t('confirmPick')
    : !quote
      ? t('working')
      : difference > 0
        ? t('confirmTake', { amount: money(difference), size: sizeLabel(chosen) })
        : difference < 0
          ? t('confirmGive', {
              amount: money(difference),
              size: sizeLabel(chosen),
            })
          : t('confirmSame', { size: sizeLabel(chosen) });

  return (
    <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={ref} className="pf-keypad psz-sheet swp-sheet" role="dialog" aria-modal="true" aria-label={t('title')} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('title')}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose} disabled={busy}>
            {t('close')}
          </button>
        </div>

        <p className="swp-line">
          <span className="swp-line-name">{line.name}</span>
        </p>

        {blockedByWindow ? (
          <p className="psz-note swp-warn" role="alert">
            {t('windowNo', { days: windowDays })}
          </p>
        ) : overrideWindow ? (
          <p className="psz-note" role="status">
            {t('windowOwner', { days: windowDays })}
          </p>
        ) : null}

        {remaining > 1 ? (
          <div className="swp-qty" role="group" aria-label={t('howMany')}>
            <span>{t('howMany')}</span>
            <span className="pf-tile-qty">
              <button type="button" className="pf-qty-btn" aria-label={t('less')} disabled={qty <= 1 || busy} onClick={() => setCount(qty - 1)}>
                −
              </button>
              <span className="pf-qty-n" aria-live="polite">
                {qty}
              </span>
              <button type="button" className="pf-qty-btn" aria-label={t('more')} disabled={qty >= remaining || busy} onClick={() => setCount(qty + 1)}>
                +
              </button>
            </span>
          </div>
        ) : null}

        <h3 className="swp-h">{t('pick')}</h3>
        {colours.length > 1 ? (
          <div className="pf-chips psz-colours" role="group" aria-label={t('colour')}>
            {colours.map((c) => (
              <button
                key={c}
                type="button"
                className={`pf-chip ${colour?.toLowerCase() === c.toLowerCase() ? 'pf-chip-on' : ''}`}
                aria-pressed={colour?.toLowerCase() === c.toLowerCase()}
                disabled={busy}
                onClick={() => {
                  setColour(c);
                  // A size chosen in another colour is not on this grid any more; ask again rather than confirm what is out of sight.
                  setChosen(null);
                  setQuote(null);
                  setNotice(null);
                  setDocumentNumber(null);
                  quoteSeq.current++;
                  setQuoting(false);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
        {loadFailed ? (
          <div className="psz-note" role="alert">
            {t('loadError')}{' '}
            <button type="button" className="btn" onClick={() => void loadSizes()}>
              {t('retry')}
            </button>
          </div>
        ) : sizes === null ? (
          <div className="psz-grid swp-skeleton" aria-busy="true" aria-label={t('loading')}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="psz-cell swp-skeleton-cell" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="psz-note">{t('noOther')}</p>
        ) : (
          <div className="psz-grid" role="group" aria-label={t('pick')}>
            {visible.map((size) => {
              const out = size.stock <= 0;
              const on = chosen?.id === size.id;
              return (
                <button
                  key={size.id}
                  type="button"
                  className={`psz-cell ${on ? 'is-on' : ''} ${out ? 'is-out' : ''}`}
                  aria-pressed={on}
                  aria-label={
                    out
                      ? t('cellOut', { size: sizeLabel(size) })
                      : t('cellLeft', {
                          size: sizeLabel(size),
                          n: size.stock,
                        })
                  }
                  disabled={out || busy || blockedByWindow}
                  onClick={() => choose(size)}
                >
                  <span className="psz-label">{colours.length > 1 ? size.option1 : sizeLabel(size)}</span>
                  <span className="psz-left">{out ? t('out') : t('left', { n: size.stock })}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="swp-diff" role="status" aria-live="polite">
          {quoting ? (
            <span className="psz-note">{t('working')}</span>
          ) : quote ? (
            <span className={`swp-diff-line ${difference === 0 ? '' : 'is-money'}`}>
              {difference === 0 ? t('same') : difference > 0 ? t('pays', { amount: money(difference) }) : t('gets', { amount: money(difference) })}
            </span>
          ) : null}
        </div>

        {quote && difference !== 0 ? (
          <div className="swp-how" role="group" aria-label={difference > 0 ? t('howPaid', { amount: money(difference) }) : t('howGiven', { amount: money(difference) })}>
            <span className="swp-how-q">{difference > 0 ? t('howPaid', { amount: money(difference) }) : t('howGiven', { amount: money(difference) })}</span>
            <div className="pf-chips">
              {MODES.map((m) => (
                <button key={m} type="button" className={`pf-chip ${mode === m ? 'pf-chip-on' : ''}`} aria-pressed={mode === m} disabled={busy} onClick={() => setMode(m)}>
                  {tm(m)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {documentNumber !== null ? (
          <div className="psz-note swp-warn" role="alert">
            <p>{t('documentIssued', { number: documentNumber })}</p>
            <button type="button" className="btn" disabled={busy} onClick={() => void confirm(true)}>
              {t('swapAnyway')}
            </button>
          </div>
        ) : null}

        {notice ? (
          <p className="psz-note swp-warn" role="alert">
            {notice}
          </p>
        ) : null}

        <div className="swp-bar">
          <button type="button" className="btn btn-primary swp-confirm" disabled={!canConfirm || documentNumber !== null} onClick={() => void confirm()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
