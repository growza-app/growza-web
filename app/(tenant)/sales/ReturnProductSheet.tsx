'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { api, ApiError, formatMoney, formatTime, type ReturnSaleProductsResponse, type VisitProductLine } from '../lib/api';
import { formatDateShort } from '../lib/format';
import { initials } from '../lib/appointment-display';
import { useDialog } from '../../shared/a11y/useDialog';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';
import {
  IconBarcode,
  IconCheck,
  IconClose,
  IconMinus,
  IconPlus,
  IconProducts,
  IconReturn,
  IconSearch,
} from '../components/icons';
import {
  computeReturnWindow,
  defaultRefundMode,
  findProductLineByCode,
  lineRefundMinorForQty,
  lineRemainingQty,
  lineReturnId,
  REFUND_MODES,
  requestIdFor,
  visitKeyFromGroupKey,
  type RefundMode,
} from './sales-helpers';

export interface ReturnableSaleBill {
  key: string;
  startAt: string;
  dayISO: string;
  locationId: string | null;
  clientName: string;
  clientPhone: string | null;
  products: VisitProductLine[];
  totalMinor: number;
  /** How the bill was paid, for the refund's default. */
  paymentModes?: string[];
}

function buildInitialQtyMap(bill: ReturnableSaleBill | null, scannedCode?: string): Record<string, number> {
  if (!bill) return {};
  if (scannedCode) {
    const matched = findProductLineByCode(bill.products, scannedCode);
    if (matched && lineRemainingQty(matched) > 0) return { [lineReturnId(matched)]: 1 };
  }
  const returnable = bill.products.filter((p) => lineRemainingQty(p) > 0);
  if (returnable.length === 1 && lineRemainingQty(returnable[0]!) === 1) {
    return { [lineReturnId(returnable[0]!)]: 1 };
  }
  return {};
}

export function ReturnProductSheet({
  bills,
  initialBill = null,
  timezone,
  todayISO,
  returnWindowDays,
  onClose,
  onReturned,
}: {
  bills: readonly ReturnableSaleBill[];
  initialBill?: ReturnableSaleBill | null;
  timezone: string;
  todayISO: string;
  returnWindowDays: number;
  onClose: () => void;
  onReturned: (res: ReturnSaleProductsResponse) => void;
}) {
  const t = useTranslations('sales.returnSheet');
  const tc = useTranslations('chrome');
  const locale = useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });

  const [selectedBill, setSelectedBill] = useState<ReturnableSaleBill | null>(initialBill);
  const [query, setQuery] = useState<string>('');
  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>(() => buildInitialQtyMap(initialBill));
  const [restock, setRestock] = useState(true);
  const [refundMode, setRefundMode] = useState<RefundMode>(() => defaultRefundMode(selectedBill?.paymentModes));
  const [reason, setReason] = useState('');
  // The invoice already handed over for this bill, once the server has said so: the desk is asked before going ahead.
  const [issuedDocument, setIssuedDocument] = useState<string | null>(null);
  const requestRef = useRef<{ sig: string; id: string } | null>(null);
  const warningRef = useRef<HTMLDivElement>(null);
  // The warning sits under the lines in a scrolling sheet: bring it into view, or the press of Confirm looks like it did nothing.
  useEffect(() => {
    if (issuedDocument !== null) warningRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [issuedDocument]);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const productBills = useMemo(() => bills.filter((b) => b.products.length > 0), [bills]);

  const matchingBills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productBills.slice(0, 20);
    const digits = q.replace(/\D/g, '');
    return productBills
      .filter((b) => {
        if (b.clientName.toLowerCase().includes(q) || b.key.toLowerCase().includes(q)) return true;
        if (b.clientPhone && b.clientPhone.toLowerCase().includes(q)) return true;
        if (digits.length >= 2 && (b.clientPhone ?? '').replace(/\D/g, '').includes(digits)) return true;
        return b.products.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            Boolean(p.barcode && p.barcode.toLowerCase().includes(q)) ||
            Boolean(p.sku && p.sku.toLowerCase().includes(q)),
        );
      })
      .slice(0, 20);
  }, [productBills, query]);

  const selectBill = (bill: ReturnableSaleBill, scannedCode?: string) => {
    setSelectedBill(bill);
    setRefundMode(defaultRefundMode(bill.paymentModes));
    setIssuedDocument(null);
    setQtyByLine(buildInitialQtyMap(bill, scannedCode));
    setScanNotice(null);
    setError(null);
  };

  const applyBarcodeToSelectedBill = (rawCode: string) => {
    if (!selectedBill) return;
    const code = rawCode.trim();
    if (!code) return;
    const line = findProductLineByCode(selectedBill.products, code);
    if (!line) {
      setScanNotice(t('scannedNotFound', { code }));
      return;
    }
    const id = lineReturnId(line);
    const rem = lineRemainingQty(line);
    const current = qtyByLine[id] ?? 0;
    if (current >= rem) {
      setScanNotice(t('scannedMaxReached', { n: rem, name: line.name }));
      return;
    }
    setQtyByLine((prev) => ({ ...prev, [id]: Math.min(rem, (prev[id] ?? 0) + 1) }));
    setScanNotice(t('scannedAdded', { name: line.name }));
    setError(null);
  };

  const applyBarcodeRef = useRef(applyBarcodeToSelectedBill);
  applyBarcodeRef.current = applyBarcodeToSelectedBill;

  const hasSelectedBill = Boolean(selectedBill);
  useEffect(() => {
    if (!hasSelectedBill) return;
    let buf = '';
    let lastTs = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const now = performance.now();
      if (e.key === 'Enter') {
        if (buf.length >= 3 && now - lastTs < 120) {
          e.preventDefault();
          applyBarcodeRef.current(buf);
        }
        buf = '';
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (now - lastTs > 80) buf = '';
        buf += e.key;
        lastTs = now;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasSelectedBill]);

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const code = query.trim();
    if (!code) return;
    e.preventDefault();
    if (selectedBill) {
      applyBarcodeToSelectedBill(code);
      setQuery('');
      return;
    }
    const exactEligible = productBills.filter((b) => {
      const win = computeReturnWindow(b.dayISO, todayISO, returnWindowDays);
      const line = findProductLineByCode(b.products, code);
      return win.eligible && Boolean(line && lineRemainingQty(line) > 0);
    });
    if (exactEligible.length === 1) {
      selectBill(exactEligible[0]!, code);
      setQuery('');
    }
  };

  const billWindow = useMemo(
    () =>
      selectedBill
        ? computeReturnWindow(selectedBill.dayISO, todayISO, returnWindowDays)
        : { eligible: true, daysElapsed: 0, daysLeft: returnWindowDays, windowDays: returnWindowDays },
    [selectedBill, todayISO, returnWindowDays],
  );

  const returnableLines = useMemo(
    () => (selectedBill ? selectedBill.products.filter((p) => lineRemainingQty(p) > 0) : []),
    [selectedBill],
  );

  const { totalSelectedUnits, totalRefundMinor } = useMemo(() => {
    if (!selectedBill) return { totalSelectedUnits: 0, totalRefundMinor: 0 };
    let units = 0;
    let refund = 0;
    for (const p of selectedBill.products) {
      const q = Math.min(lineRemainingQty(p), Math.max(0, qtyByLine[lineReturnId(p)] ?? 0));
      units += q;
      refund += lineRefundMinorForQty(p, q);
    }
    return { totalSelectedUnits: units, totalRefundMinor: refund };
  }, [selectedBill, qtyByLine]);

  const setLineQty = (p: VisitProductLine, next: number) => {
    const clamped = Math.max(0, Math.min(lineRemainingQty(p), Math.trunc(next)));
    setQtyByLine((prev) => ({ ...prev, [lineReturnId(p)]: clamped }));
    setScanNotice(null);
    setError(null);
  };

  const selectAllProducts = () => {
    if (!selectedBill) return;
    const next: Record<string, number> = {};
    for (const p of selectedBill.products) {
      const rem = lineRemainingQty(p);
      if (rem > 0) next[lineReturnId(p)] = rem;
    }
    setQtyByLine(next);
    setScanNotice(null);
    setError(null);
  };

  const submitReturn = async (acknowledgeIssuedDocument = false) => {
    if (!selectedBill || totalSelectedUnits <= 0 || !billWindow.eligible || busy) return;
    setBusy(true);
    setError(null);
    try {
      const items = selectedBill.products
        .map((p) => ({
          productId: lineReturnId(p),
          qty: Math.min(lineRemainingQty(p), Math.max(0, qtyByLine[lineReturnId(p)] ?? 0)),
        }))
        .filter((it) => it.qty > 0);
      // One id per return as the desk has it on screen: pressing Return again (or a retry after a lost answer) sends the
      // same id and the server returns nothing more; changing a line, the condition, the way or the note makes a new one.
      requestRef.current = requestIdFor(
        requestRef.current,
        JSON.stringify({ bill: selectedBill.key, items, restock, refundMode, reason: reason.trim() }),
      );
      const res = await api.returnSaleProducts(visitKeyFromGroupKey(selectedBill.key), {
        items,
        restock,
        refundMode,
        reason: reason.trim() || undefined,
        idempotencyKey: requestRef.current.id,
        ...(acknowledgeIssuedDocument ? { acknowledgeIssuedDocument: true } : {}),
      });
      requestRef.current = null;
      onReturned(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'document_issued') {
        // An issued invoice is not changed by a return: say so, and let the desk decide.
        const number = (err.body as { documentNumber?: unknown } | undefined)?.documentNumber;
        setIssuedDocument(typeof number === 'string' ? number : '');
      } else {
        setError(err instanceof ApiError ? err.message : tc('sheet.saveFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const formatBillWhen = (b: ReturnableSaleBill) =>
    `${formatDateShort(new Date(`${b.dayISO}T12:00:00`), undefined, locale)} · ${formatTime(b.startAt, timezone)}`;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet sls-return-sheet" role="dialog" aria-modal="true" aria-label={t('title')} ref={dialogRef}>
        <div className="sheet-grab" />
        <div className="sls-ret-head">
          <span className="sls-ret-head-icon" aria-hidden="true">
            <IconReturn />
          </span>
          <div className="sls-ret-head-copy">
            <h2 className="sls-ret-title">{t('title')}</h2>
            <p className="sls-ret-sub">{t('subtitle')}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tc('close')}>
            <IconClose />
          </button>
        </div>

        <div className="sls-ret-scroll">
          <div className="sls-ret-scan-box">
            <div className="sls-ret-scan-top">
              <span className="sls-ret-scan-label">{t('scanLabel')}</span>
              <span className="sls-ret-scan-ready">
                <IconBarcode />
                <span>{t('scanReady')}</span>
              </span>
            </div>
            <label className="search-wrap sls-ret-search">
              <IconSearch />
              <input
                type="search"
                className="search-input search-input-bare"
                placeholder={t('scanPlaceholder')}
                value={query}
                autoFocus={autoFocusField()}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setScanNotice(null);
                }}
                onKeyDown={handleSearchKeyDown}
              />
            </label>
            {scanNotice ? (
              <div className="sls-ret-scan-notice" role="status">
                {scanNotice}
              </div>
            ) : null}
          </div>

          {!selectedBill ? (
            <div className="sls-ret-picker">
              <div className="sls-ret-sec-head">
                <span className="sls-ret-sec-title">{query.trim() ? t('matchingBills') : t('recentProductBills')}</span>
              </div>
              {matchingBills.length === 0 ? (
                <div className="sls-ret-empty">
                  {query.trim() ? t('noMatchingBills', { q: query.trim() }) : t('noProductBills')}
                </div>
              ) : (
                <div className="sls-ret-bill-list">
                  {matchingBills.map((b) => {
                    const win = computeReturnWindow(b.dayISO, todayISO, returnWindowDays);
                    const remUnits = b.products.reduce((s, p) => s + lineRemainingQty(p), 0);
                    const disabled = !win.eligible || remUnits <= 0;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        className={`sls-ret-bill-card ${disabled ? 'is-disabled' : ''}`}
                        disabled={disabled}
                        onClick={() => selectBill(b, query.trim())}
                      >
                        <div className="sls-ret-bill-main">
                          <span className="sls-avatar">{initials(b.clientName)}</span>
                          <div className="sls-ret-bill-meta">
                            <div className="sls-ret-bill-title-row">
                              <strong>{b.clientName}</strong>
                              <span className="sls-ret-bill-when">{formatBillWhen(b)}</span>
                            </div>
                            <div className="sls-ret-bill-prds">
                              {b.products.map((p, idx) => (
                                <span key={`${lineReturnId(p)}-${idx}`} className="sls-badge sls-badge-prd">
                                  <IconProducts />
                                  {p.name} ({p.qty})
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="sls-ret-bill-right">
                          <span
                            className={`sls-ret-win-pill ${
                              remUnits <= 0 ? 'is-muted' : win.eligible ? 'is-ok' : 'is-expired'
                            }`}
                          >
                            {remUnits <= 0
                              ? t('allReturned')
                              : win.eligible
                                ? t('windowDaysLeft', { left: win.daysLeft, window: win.windowDays })
                                : t('windowEnded', { window: win.windowDays })}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="sls-ret-selected-bill">
                <span className="sls-avatar">{initials(selectedBill.clientName)}</span>
                <div className="sls-ret-selected-meta">
                  <strong>{selectedBill.clientName}</strong>
                  <span>{formatBillWhen(selectedBill)}</span>
                </div>
                <span className={`sls-ret-win-pill ${billWindow.eligible ? 'is-ok' : 'is-expired'}`}>
                  {billWindow.eligible ? (
                    <>
                      <IconCheck />
                      <span>{t('windowDaysLeft', { left: billWindow.daysLeft, window: billWindow.windowDays })}</span>
                    </>
                  ) : (
                    <span>{t('windowEnded', { window: billWindow.windowDays })}</span>
                  )}
                </span>
                {!initialBill ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm sls-ret-change-btn"
                    onClick={() => {
                      setSelectedBill(null);
                      setQtyByLine({});
                      setError(null);
                    }}
                  >
                    {t('changeBill')}
                  </button>
                ) : null}
              </div>

              <div className="sls-ret-sec-head">
                <span className="sls-ret-sec-title">{t('productsOnBill')}</span>
                {billWindow.eligible && returnableLines.length > 0 ? (
                  <div className="sls-ret-bulk-btns">
                    {totalSelectedUnits > 0 ? (
                      <button type="button" className="sls-ret-link-btn is-muted" onClick={() => setQtyByLine({})}>
                        {t('clearSelection')}
                      </button>
                    ) : null}
                    <button type="button" className="sls-ret-link-btn" onClick={selectAllProducts}>
                      {t('returnAll')}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="sls-ret-lines">
                {selectedBill.products.map((p, idx) => {
                  const id = lineReturnId(p);
                  const remaining = lineRemainingQty(p);
                  const alreadyRet = Number(p.returnedQty || 0);
                  const selectedQty = Math.min(remaining, Math.max(0, qtyByLine[id] ?? 0));
                  const lineRefund = lineRefundMinorForQty(p, selectedQty);
                  const unitMinor = Math.round(Number(p.paidMinor || 0) / Math.max(1, Number(p.qty || 1)));
                  return (
                    <div
                      key={`${id}-${idx}`}
                      className={`sls-ret-line ${selectedQty > 0 ? 'is-picked' : ''} ${
                        remaining <= 0 ? 'is-exhausted' : ''
                      }`}
                    >
                      <div className="sls-ret-line-info">
                        <div className="sls-ret-line-name-row">
                          <strong className="sls-ret-line-name">{p.name}</strong>
                          {p.sku || p.barcode ? <span className="sls-ret-code-pill">{p.sku ?? p.barcode}</span> : null}
                        </div>
                        <div className="sls-ret-line-sub">
                          <span>{t('soldQty', { n: p.qty })}</span>
                          <span>·</span>
                          <span>{t('eachPrice', { price: formatMoney(String(unitMinor)) })}</span>
                          {alreadyRet > 0 ? (
                            <>
                              <span>·</span>
                              <span className="sls-ret-already-tag">{t('alreadyReturned', { n: alreadyRet })}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {remaining <= 0 ? (
                        <span className="sls-ret-win-pill is-muted">{t('allReturned')}</span>
                      ) : billWindow.eligible ? (
                        <div className="sls-ret-line-controls">
                          <div className="sls-ret-stepper">
                            <button
                              type="button"
                              className="sls-ret-step-btn"
                              aria-label={t('lessAria', { name: p.name })}
                              disabled={selectedQty <= 0 || busy}
                              onClick={() => setLineQty(p, selectedQty - 1)}
                            >
                              <IconMinus />
                            </button>
                            <span className="sls-ret-step-val" aria-live="polite">
                              {selectedQty}
                            </span>
                            <button
                              type="button"
                              className="sls-ret-step-btn"
                              aria-label={t('moreAria', { name: p.name })}
                              disabled={selectedQty >= remaining || busy}
                              onClick={() => setLineQty(p, selectedQty + 1)}
                            >
                              <IconPlus />
                            </button>
                          </div>
                          <strong className="sls-ret-line-refund">
                            {selectedQty > 0 ? `−${formatMoney(String(lineRefund))}` : formatMoney('0')}
                          </strong>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="sls-ret-condition">
                <span className="sls-ret-sec-title">{t('conditionLabel')}</span>
                <div className="sls-ret-cond-grid" role="radiogroup" aria-label={t('conditionLabel')}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={restock}
                    className={`sls-ret-cond-opt ${restock ? 'is-on' : ''}`}
                    onClick={() => setRestock(true)}
                  >
                    <strong>{t('restockShelf')}</strong>
                    <span>{t('restockShelfHint')}</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!restock}
                    className={`sls-ret-cond-opt ${!restock ? 'is-on is-damaged' : ''}`}
                    onClick={() => setRestock(false)}
                  >
                    <strong>{t('damagedOpened')}</strong>
                    <span>{t('damagedOpenedHint')}</span>
                  </button>
                </div>
              </div>

              <div className="sls-ret-condition">
                <span className="sls-ret-sec-title">{t('refundModeLabel')}</span>
                <div className="sls-ret-cond-grid" role="radiogroup" aria-label={t('refundModeLabel')}>
                  {REFUND_MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={refundMode === m}
                      className={`sls-ret-cond-opt ${refundMode === m ? 'is-on' : ''}`}
                      onClick={() => {
                        setRefundMode(m);
                        setIssuedDocument(null);
                      }}
                    >
                      <strong>{t(`refundModes.${m}`)}</strong>
                    </button>
                  ))}
                </div>
              </div>

              <label className="sls-ret-reason-field">
                <span className="sls-ret-sec-title">{t('reasonLabel')}</span>
                <input
                  type="text"
                  className="sls-ret-reason-input"
                  placeholder={t('reasonPlaceholder')}
                  maxLength={240}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>

              {issuedDocument !== null ? (
                <div className="sls-ret-error" role="alert" ref={warningRef}>
                  <p>{issuedDocument ? t('documentIssuedBody', { number: issuedDocument }) : t('documentIssuedBodyNoNumber')}</p>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void submitReturn(true)}>
                    {t('documentIssuedGo')}
                  </button>
                </div>
              ) : null}

              {error ? (
                <div className="sls-ret-error" role="alert">
                  {error}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="modal-actions sls-ret-foot">
          {selectedBill ? (
            <div className="sls-ret-foot-summary">
              <span className="sls-ret-foot-label">{t('refundTotal')}</span>
              <strong className="sls-ret-foot-amount">{formatMoney(String(totalRefundMinor))}</strong>
              <span className="sls-ret-foot-sub">{t('unitsSelected', { n: totalSelectedUnits })}</span>
            </div>
          ) : (
            <div />
          )}
          <div className="sls-ret-foot-btns">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              {tc('close')}
            </button>
            {selectedBill ? (
              <button
                type="button"
                className="btn"
                disabled={totalSelectedUnits <= 0 || !billWindow.eligible || busy}
                onClick={() => void submitReturn()}
              >
                {busy
                  ? t('saving')
                  : totalRefundMinor > 0
                    ? t('confirmWithAmount', { amount: formatMoney(String(totalRefundMinor)) })
                    : t('confirm')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
