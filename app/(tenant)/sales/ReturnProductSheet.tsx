'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { api, ApiError, formatMoney, formatTime, type ReturnSaleProductsResponse, type VisitProductLine } from '../lib/api';
import { formatDate } from '../lib/format';
import { useBarcodeScan } from '../lib/barcode-scan';
import { initials } from '../lib/appointment-display';
import { useDialog } from '../../shared/a11y/useDialog';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';
import {
  IconAlert,
  IconArrowLeft,
  IconBarcode,
  IconCheck,
  IconClose,
  IconInfo,
  IconMinus,
  IconPackages,
  IconPayCard,
  IconPayCash,
  IconPayOther,
  IconPayUpi,
  IconPlus,
  IconPrint,
  IconProducts,
  IconReceipt,
  IconReturn,
  IconSearch,
} from '../components/icons';
import {
  buildSelectAllQtyMap,
  computeReturnSelection,
  computeReturnWindow,
  defaultRefundMode,
  findProductLineByCode,
  formatBillRef,
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

function RefundModeIcon({ mode }: { mode: RefundMode }) {
  if (mode === 'cash') return <IconPayCash />;
  if (mode === 'upi') return <IconPayUpi />;
  if (mode === 'card') return <IconPayCard />;
  return <IconPayOther />;
}

export function ReturnProductSheet({
  bills,
  initialBill = null,
  timezone,
  todayISO,
  returnWindowDays,
  onClose,
  onViewBill,
  onReturned,
}: {
  bills: readonly ReturnableSaleBill[];
  initialBill?: ReturnableSaleBill | null;
  timezone: string;
  todayISO: string;
  returnWindowDays: number;
  onClose: () => void;
  onViewBill?: (billKey: string) => void;
  onReturned: (res: ReturnSaleProductsResponse) => void;
}) {
  const t = useTranslations('sales.returnSheet');
  const tc = useTranslations('chrome');
  const locale = useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });

  const productBills = useMemo(() => bills.filter((b) => b.products.length > 0), [bills]);

  const defaultBill = useMemo(
    () =>
      initialBill ??
      productBills.find(
        (b) =>
          computeReturnWindow(b.dayISO, todayISO, returnWindowDays).eligible &&
          b.products.some((p) => lineRemainingQty(p) > 0),
      ) ??
      productBills[0] ??
      null,
    [initialBill, productBills, todayISO, returnWindowDays],
  );

  const [step, setStep] = useState<1 | 2 | 'done'>(1);
  const [selectedBill, setSelectedBill] = useState<ReturnableSaleBill | null>(defaultBill);
  const [mobileStep, setMobileStep] = useState<'list' | 'bill'>(initialBill ? 'bill' : 'list');
  const [query, setQuery] = useState<string>('');
  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>(() => buildInitialQtyMap(defaultBill));
  const [restock, setRestock] = useState(true);
  const [refundMode, setRefundMode] = useState<RefundMode>(() => defaultRefundMode(defaultBill?.paymentModes));
  const [reason, setReason] = useState('');
  const [completedResult, setCompletedResult] = useState<ReturnSaleProductsResponse | null>(null);
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

  const matchingBills = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '');
    if (!q) return productBills.slice(0, 20);
    const digits = q.replace(/\D/g, '');
    return productBills
      .filter((b) => {
        const ref = formatBillRef(b.key).toLowerCase();
        if (ref.includes(q) || b.clientName.toLowerCase().includes(q) || b.key.toLowerCase().includes(q)) return true;
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
    setStep(1);
    setMobileStep('bill');
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

  /**
   * What a scanned or typed code does: with a bill open it adds a unit of that product; with none it opens the one
   * bill that sold it, or leaves the code in the box to narrow the list. True when the code was used up.
   */
  const takeCode = (raw: string): boolean => {
    const code = raw.trim();
    if (!code) return false;
    if (selectedBill && findProductLineByCode(selectedBill.products, code)) {
      applyBarcodeToSelectedBill(code);
      return true;
    }
    const exactEligible = productBills.filter((b) => {
      const win = computeReturnWindow(b.dayISO, todayISO, returnWindowDays);
      const line = findProductLineByCode(b.products, code);
      return win.eligible && Boolean(line && lineRemainingQty(line) > 0);
    });
    if (exactEligible.length === 1) {
      selectBill(exactEligible[0]!, code);
      return true;
    }
    if (selectedBill) {
      applyBarcodeToSelectedBill(code);
      return true;
    }
    setQuery(code);
    return false;
  };
  // The scanner types wherever focus is. On a phone the box is not focused (that would raise the keyboard), so the
  // sheet listens itself rather than wait for a tap into the box. The "Scanner ready" badge is true because of this.
  useBarcodeScan(step === 1, (code) => void takeCode(code), { insideDialog: true });

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const code = query.trim();
    if (!code) return;
    e.preventDefault();
    if (takeCode(code)) setQuery('');
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

  const { selectedItemsCount, totalSelectedUnits, totalRefundMinor, selectedLines } = useMemo(
    () => computeReturnSelection(selectedBill?.products ?? [], qtyByLine),
    [selectedBill, qtyByLine],
  );

  const setLineQty = (p: VisitProductLine, next: number) => {
    const clamped = Math.max(0, Math.min(lineRemainingQty(p), Math.trunc(next)));
    setQtyByLine((prev) => ({ ...prev, [lineReturnId(p)]: clamped }));
    setScanNotice(null);
    setError(null);
  };

  const selectAllProducts = () => {
    if (!selectedBill) return;
    setQtyByLine(buildSelectAllQtyMap(selectedBill.products));
    setScanNotice(null);
    setError(null);
  };

  const goToReviewStep = () => {
    if (!selectedBill || totalSelectedUnits <= 0 || !billWindow.eligible) return;
    setError(null);
    setIssuedDocument(null);
    setStep(2);
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
      setCompletedResult(res);
      setStep('done');
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

  const goBackFromHeader = () => {
    if (step === 2) {
      setStep(1);
      setIssuedDocument(null);
      setError(null);
      return;
    }
    setMobileStep('list');
    setIssuedDocument(null);
    setScanNotice(null);
    setError(null);
  };

  const formatBillWhen = (b: ReturnableSaleBill) =>
    `${formatDate(new Date(`${b.dayISO}T12:00:00`), undefined, locale)}, ${formatTime(b.startAt, timezone)}`;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        className={`sheet sls-return-sheet is-step-${step} is-mobile-${mobileStep}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        ref={dialogRef}
      >
        <div className="sheet-grab" />

        {/* Header with title, 2-step progress indicator, Scanner ready pill, and Close */}
        <div className="sls-ret-head">
          {(step === 1 && mobileStep === 'bill') || step === 2 ? (
            <button
              type="button"
              className="icon-btn sls-ret-back-btn"
              onClick={goBackFromHeader}
              disabled={busy}
              aria-label={tc('back')}
            >
              <IconArrowLeft />
            </button>
          ) : null}
          <span className="sls-ret-head-icon" aria-hidden="true">
            <IconReturn />
          </span>
          <div className="sls-ret-head-copy">
            <h2 className="sls-ret-title">{t('title')}</h2>
            <p className="sls-ret-sub">
              {step === 2 ? t('subtitleReview') : step === 'done' ? t('subtitleDone') : t('subtitle')}
            </p>
          </div>

          <div className="sls-ret-steps" aria-label={t('title')}>
            <button
              type="button"
              className={`sls-ret-step-pill ${step === 1 ? 'is-active' : 'is-done'}`}
              disabled={step !== 2 || busy}
              onClick={() => {
                if (step === 2 && !busy) setStep(1);
              }}
            >
              <span className="sls-ret-step-num" aria-hidden="true">
                {step === 1 ? '1' : <IconCheck />}
              </span>
              <span className="sls-ret-step-lbl">{t('stepSelect')}</span>
            </button>
            <span className={`sls-ret-step-line ${step !== 1 ? 'is-done' : ''}`} aria-hidden="true" />
            <div className={`sls-ret-step-pill ${step === 2 ? 'is-active' : step === 'done' ? 'is-done' : ''}`}>
              <span className="sls-ret-step-num" aria-hidden="true">
                {step === 'done' ? <IconCheck /> : '2'}
              </span>
              <span className="sls-ret-step-lbl">{t('stepReview')}</span>
            </div>
          </div>

          <span className="sls-ret-scan-ready">
            <IconBarcode />
            <span>{t('scanReady')}</span>
          </span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tc('close')}>
            <IconClose />
          </button>
        </div>

        {/* STEP 1: SELECT ITEMS */}
        {step === 1 ? (
          <div className="sls-ret-split is-step-1">
            {/* Left column: Search + Recent bills */}
            <div className="sls-ret-left">
              <div className="sls-ret-search-box">
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
                  <span className="sls-ret-search-barcode" aria-hidden="true">
                    <IconBarcode />
                  </span>
                </label>
              </div>

              <div className="sls-ret-sec-head sls-ret-left-head">
                <span className="sls-ret-sec-title is-sentence">
                  {query.trim() ? t('matchingBills') : t('recentProductBills')}
                </span>
                <span className="sls-ret-sec-meta">{t('windowPolicy', { window: returnWindowDays })}</span>
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
                    const totalUnits = b.products.reduce((s, p) => s + Number(p.qty || 0), 0);
                    const prdPaidMinor = b.products.reduce((s, p) => s + Number(p.paidMinor || 0), 0);
                    const disabled = !win.eligible || remUnits <= 0;
                    const active = selectedBill?.key === b.key;
                    const billRef = formatBillRef(b.key);
                    return (
                      <button
                        key={b.key}
                        type="button"
                        className={`sls-ret-bill-card ${active ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
                        onClick={() => selectBill(b, query.trim())}
                      >
                        <span className="sls-ret-bill-doc-icon" aria-hidden="true">
                          <IconReceipt />
                        </span>
                        <div className="sls-ret-bill-body">
                          <strong className="sls-ret-bill-client">{b.clientName}</strong>
                          <span className="sls-ret-bill-when">
                            #{billRef} · {formatBillWhen(b)}
                          </span>
                          <span className="sls-ret-bill-count">{t('itemsCount', { n: totalUnits })}</span>
                        </div>
                        <div className="sls-ret-bill-aside">
                          <strong className="sls-ret-bill-amt">{formatMoney(String(prdPaidMinor))}</strong>
                          <span
                            className={`sls-ret-win-pill ${
                              remUnits <= 0 ? 'is-muted' : win.eligible ? 'is-ok' : 'is-expired'
                            }`}
                          >
                            {remUnits <= 0
                              ? t('allReturned')
                              : win.eligible
                                ? t('windowDaysShort', { left: win.daysLeft })
                                : t('windowEnded', { window: win.windowDays })}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right column: Selected bill details + Items table + Step 1 footer */}
            <div className="sls-ret-right">
              {!selectedBill ? (
                <div className="sls-ret-right-empty">
                  <p>{t('noProductBills')}</p>
                </div>
              ) : (
                <>
                  <div className="sls-ret-scroll">
                    <div className="sls-ret-selected-bill">
                      <span className="sls-avatar">{initials(selectedBill.clientName)}</span>
                      <div className="sls-ret-selected-meta">
                        <strong>{selectedBill.clientName}</strong>
                        <span>
                          {t('billPrefix', { ref: formatBillRef(selectedBill.key) })} · {formatBillWhen(selectedBill)}
                        </span>
                      </div>
                      <div className="sls-ret-bulk-btns">
                        {billWindow.eligible && returnableLines.length > 0 ? (
                          <>
                            {totalSelectedUnits > 0 ? (
                              <button type="button" className="sls-ret-link-btn is-muted" onClick={() => setQtyByLine({})}>
                                {t('clearSelection')}
                              </button>
                            ) : null}
                            <button type="button" className="sls-ret-link-btn" onClick={selectAllProducts}>
                              {t('returnAll')}
                            </button>
                          </>
                        ) : (
                          <span className="sls-ret-win-pill is-expired">
                            {!billWindow.eligible
                              ? t('windowEnded', { window: billWindow.windowDays })
                              : t('allReturned')}
                          </span>
                        )}
                        {onViewBill ? (
                          <button
                            type="button"
                            className="sls-ret-view-bill-btn"
                            onClick={() => onViewBill(selectedBill.key)}
                          >
                            <span>{t('viewBill')}</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {scanNotice ? (
                      <div className="sls-ret-scan-notice" role="status">
                        {scanNotice}
                      </div>
                    ) : null}

                    <div className="sls-ret-table-wrap">
                      <table className="sls-ret-table">
                        <thead>
                          <tr>
                            <th>{t('colProduct')}</th>
                            <th>{t('colSku')}</th>
                            <th className="is-num">{t('colPurchased')}</th>
                            <th className="is-num">{t('colAlreadyReturned')}</th>
                            <th className="is-center">{t('colReturnNow')}</th>
                            <th className="is-right">{t('colRefundAmount')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedBill.products.map((p, idx) => {
                            const id = lineReturnId(p);
                            const remaining = lineRemainingQty(p);
                            const alreadyRet = Number(p.returnedQty || 0);
                            const selectedQty = Math.min(remaining, Math.max(0, qtyByLine[id] ?? 0));
                            const lineRefund = lineRefundMinorForQty(p, selectedQty);
                            const skuOrCode = p.sku ?? p.barcode ?? '—';
                            return (
                              <tr
                                key={`${id}-${idx}`}
                                className={`sls-ret-tr ${selectedQty > 0 ? 'is-picked' : ''} ${
                                  remaining <= 0 ? 'is-exhausted' : ''
                                }`}
                              >
                                <td data-label={t('colProduct')}>
                                  <div className="sls-ret-prd-cell">
                                    <span className="sls-ret-prd-thumb" aria-hidden="true">
                                      <IconProducts />
                                    </span>
                                    <strong className="sls-ret-line-name">{p.name}</strong>
                                  </div>
                                </td>
                                <td data-label={t('colSku')} className="sls-ret-sku-cell">
                                  {skuOrCode}
                                </td>
                                <td data-label={t('colPurchased')} className="is-num">
                                  {p.qty}
                                </td>
                                <td data-label={t('colAlreadyReturned')} className="is-num">
                                  {alreadyRet}
                                </td>
                                <td data-label={t('colReturnNow')} className="is-center">
                                  {remaining <= 0 ? (
                                    <span className="sls-ret-exhausted-pill">
                                      <IconMinus />
                                      <span>{t('allReturned')}</span>
                                    </span>
                                  ) : billWindow.eligible ? (
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
                                  ) : (
                                    <span className="sls-ret-win-pill is-expired">
                                      {t('windowEnded', { window: billWindow.windowDays })}
                                    </span>
                                  )}
                                </td>
                                <td data-label={t('colRefundAmount')} className="is-right">
                                  <strong className="sls-ret-line-refund">{formatMoney(String(lineRefund))}</strong>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="modal-actions sls-ret-foot">
                    <div className="sls-ret-foot-summary">
                      <span className="sls-ret-foot-label">
                        {t('itemsSelectedSummary', { items: selectedItemsCount })}
                      </span>
                      <strong className="sls-ret-foot-amount">{formatMoney(String(totalRefundMinor))}</strong>
                    </div>
                    <div className="sls-ret-foot-btns">
                      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                        {t('cancelBtn')}
                      </button>
                      <button
                        type="button"
                        className="btn sls-ret-continue-btn"
                        disabled={totalSelectedUnits <= 0 || !billWindow.eligible || busy}
                        onClick={goToReviewStep}
                      >
                        {t('continueBtn')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {/* STEP 2: REVIEW & REFUND */}
        {step === 2 && selectedBill ? (
          <div className="sls-ret-split is-step-2">
            {/* Left column: Bill details + Items being returned + Total refund */}
            <div className="sls-ret-left is-review-left">
              <div className="sls-ret-review-sec">
                <h3 className="sls-ret-review-heading">{t('billDetails')}</h3>
                <div className="sls-ret-review-bill-card">
                  <span className="sls-avatar sls-ret-review-avatar">{initials(selectedBill.clientName)}</span>
                  <div className="sls-ret-review-bill-meta">
                    <strong>{selectedBill.clientName}</strong>
                    <span>{t('billPrefix', { ref: formatBillRef(selectedBill.key) })}</span>
                    <span>{formatBillWhen(selectedBill)}</span>
                  </div>
                </div>
              </div>

              <div className="sls-ret-review-sec sls-ret-review-items-sec">
                <h3 className="sls-ret-review-heading">{t('itemsBeingReturned', { n: selectedLines.length })}</h3>
                <div className="sls-ret-review-items-list">
                  {selectedLines.map(({ line, id, qty, unitMinor, refundMinor }) => (
                    <div key={id} className="sls-ret-review-item">
                      <span className="sls-ret-prd-thumb is-lg" aria-hidden="true">
                        <IconProducts />
                      </span>
                      <div className="sls-ret-review-item-info">
                        <strong>{line.name}</strong>
                        {line.sku || line.barcode ? (
                          <span>{t('skuLabel', { sku: line.sku ?? line.barcode ?? '' })}</span>
                        ) : null}
                        <span>{t('eachPrice', { price: formatMoney(String(unitMinor)) })}</span>
                      </div>
                      <div className="sls-ret-review-item-right">
                        <span>{t('qtyShort', { n: qty })}</span>
                        <strong>{formatMoney(String(refundMinor))}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sls-ret-review-total">
                <span>{t('totalRefundLabel')}</span>
                <strong>{formatMoney(String(totalRefundMinor))}</strong>
              </div>
            </div>

            {/* Right column: Condition + Refund method + Reason + Confirm footer */}
            <div className="sls-ret-right">
              <div className="sls-ret-scroll">
                <div className="sls-ret-condition">
                  <div className="sls-ret-field-head">
                    <span className="sls-ret-field-title">{t('conditionLabel')}</span>
                    <span className="sls-ret-info-icon" aria-hidden="true">
                      <IconInfo />
                    </span>
                  </div>
                  <div className="sls-ret-cond-grid" role="radiogroup" aria-label={t('conditionLabel')}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={restock}
                      className={`sls-ret-cond-opt ${restock ? 'is-on' : ''}`}
                      onClick={() => setRestock(true)}
                    >
                      <span className="sls-ret-cond-icon" aria-hidden="true">
                        <IconPackages />
                      </span>
                      <div className="sls-ret-cond-copy">
                        <strong>{t('restockShelf')}</strong>
                        <span>{t('restockShelfHint')}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!restock}
                      className={`sls-ret-cond-opt ${!restock ? 'is-on is-damaged' : ''}`}
                      onClick={() => setRestock(false)}
                    >
                      <span className="sls-ret-cond-icon" aria-hidden="true">
                        <IconAlert />
                      </span>
                      <div className="sls-ret-cond-copy">
                        <strong>{t('damagedOpened')}</strong>
                        <span>{t('damagedOpenedHint')}</span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="sls-ret-condition">
                  <span className="sls-ret-field-title">{t('refundModeLabel')}</span>
                  <div className="sls-ret-mode-grid" role="radiogroup" aria-label={t('refundModeLabel')}>
                    {REFUND_MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={refundMode === m}
                        className={`sls-ret-mode-opt ${refundMode === m ? 'is-on' : ''}`}
                        onClick={() => {
                          setRefundMode(m);
                          setIssuedDocument(null);
                        }}
                      >
                        <RefundModeIcon mode={m} />
                        <strong>{t(`refundModes.${m}`)}</strong>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="sls-ret-reason-field">
                  <span className="sls-ret-field-title">{t('reasonLabel')}</span>
                  <textarea
                    className="sls-ret-reason-textarea"
                    placeholder={t('reasonPlaceholder')}
                    maxLength={200}
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <span className="sls-ret-reason-count">{reason.length}/200</span>
                </label>

                {issuedDocument !== null ? (
                  <div className="sls-ret-error" role="alert" ref={warningRef}>
                    <p>
                      {issuedDocument
                        ? t('documentIssuedBody', { number: issuedDocument })
                        : t('documentIssuedBodyNoNumber')}
                    </p>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => void submitReturn(true)}
                    >
                      {t('documentIssuedGo')}
                    </button>
                  </div>
                ) : null}

                {error ? (
                  <div className="sls-ret-error" role="alert">
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="modal-actions sls-ret-foot is-step-2-foot">
                <div className="sls-ret-foot-btns">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      setIssuedDocument(null);
                      setStep(1);
                    }}
                  >
                    {t('backBtn')}
                  </button>
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
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* POST-CONFIRMATION RECEIPT VIEW (only shown after backend transaction succeeds) */}
        {step === 'done' && completedResult && selectedBill ? (
          <div className="sls-ret-done-wrap">
            <div className="sls-ret-done-card">
              <div className="sls-ret-done-head">
                <span className="sls-ret-done-badge" aria-hidden="true">
                  <IconCheck />
                </span>
                <div>
                  <h3 className="sls-ret-done-title">{t('doneTitle')}</h3>
                  <p className="sls-ret-done-sub">
                    {t('doneRef', { ref: formatBillRef(completedResult.visitKey) })} · {selectedBill.clientName} ·{' '}
                    {t(`refundModes.${completedResult.refundMode}`)}
                  </p>
                </div>
                <strong className="sls-ret-done-total">{formatMoney(String(completedResult.refundMinor))}</strong>
              </div>

              <div className="sls-ret-done-items">
                {completedResult.items.map((it) => (
                  <div key={it.productId} className="sls-ret-done-item">
                    <div>
                      <strong>{it.name}</strong>
                      <span>
                        {t('qtyShort', { n: it.qty })} · {it.restocked ? t('restockShelf') : t('damagedOpened')}
                      </span>
                    </div>
                    <strong>{formatMoney(String(it.refundMinor))}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions sls-ret-foot is-step-2-foot">
              <div className="sls-ret-foot-btns">
                <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
                  <IconPrint />
                  <span>{t('printReceipt')}</span>
                </button>
                <button type="button" className="btn" onClick={onClose}>
                  {t('doneBtn')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
