'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, formatTime, type Appointment } from '../lib/api';
import { formatDateShort } from '../lib/format';
import { bookingBill, clientNameLabel, groupBookings, initials, summarizeServices, type BookingGroup } from '../lib/appointment-display';
import { PageHeader } from '../components/PageHeader';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { BookingSummary } from '../components/BookingSummary';
import { useBranch } from '../components/BranchProvider';
import { useMayUse } from '../components/SessionProvider';
import { useLabel } from '../components/LabelsProvider';
import { pickNoun } from '../lib/nouns';
import {
  IconPackages,
  IconProducts,
  IconReceipt,
  IconRupee,
  IconSearch,
  IconServices,
} from '../components/icons';

export type SalesFilter = 'all' | 'products' | 'services';
export const SALES_FILTERS: readonly SalesFilter[] = ['all', 'products', 'services'];

export type SalesRange = 'today' | 'last_7_days' | 'last_30_days';
export const SALES_RANGES: readonly SalesRange[] = ['today', 'last_7_days', 'last_30_days'];

export const MAX_ROW_PRODUCTS = 2;

export interface SaleRow {
  group: BookingGroup;
  key: string;
  startAt: string;
  dayISO: string;
  locationId: string | null;
  clientName: string;
  clientPhone: string | null;
  serviceNames: string[];
  offerTitle: string | null;
  products: NonNullable<BookingGroup['products']>;
  productUnits: number;
  staffNames: string[];
  paymentModes: string[];
  servicesMinor: number;
  productsMinor: number;
  totalMinor: number;
}

/**
 * Builds completed sale rows from raw appointments, newest first.
 * A visit is included if at least one leg is `completed` or it carries sold products.
 */
export function buildSaleRows(appointments: readonly Appointment[], timezone: string): SaleRow[] {
  const groups = groupBookings([...appointments]);
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  const out: SaleRow[] = [];

  for (const g of groups) {
    const completedLegs = g.appointments.filter((a) => a.status === 'completed');
    const products = g.products ?? [];
    if (completedLegs.length === 0 && products.length === 0) continue;

    const { totalMinor: servicesMinor } = completedLegs.length > 0 ? bookingBill(completedLegs) : { totalMinor: 0 };
    const productsMinor = products.reduce((sum, p) => sum + Number(p.paidMinor || 0), 0);
    const totalMinor = servicesMinor + productsMinor;
    const productUnits = products.reduce((sum, p) => sum + Number(p.qty || 0), 0);

    const serviceNames = completedLegs.map((a) => a.serviceName).filter(Boolean);
    const offerTitles = [...new Set(completedLegs.map((a) => a.offerTitle).filter((t): t is string => Boolean(t)))];
    const staffSet = new Set<string>();
    for (const a of completedLegs) {
      if (a.providerName) staffSet.add(a.providerName);
    }

    const payments = g.payments ?? [];
    const fallbackMode =
      completedLegs.find((a) => a.paymentMode)?.paymentMode ?? g.appointments.find((a) => a.paymentMode)?.paymentMode;
    const paymentModes =
      payments.length > 0
        ? [...new Set(payments.map((p) => p.mode))]
        : fallbackMode
          ? [fallbackMode]
          : [];

    const dayISO = dayFmt.format(new Date(g.startAt));

    out.push({
      group: g,
      key: g.key,
      startAt: g.startAt,
      dayISO,
      locationId: g.appointments[0]?.locationId ?? null,
      clientName: clientNameLabel(g) ?? g.customerName ?? '—',
      clientPhone: g.customerPhone ?? null,
      serviceNames,
      offerTitle: offerTitles.length > 0 ? offerTitles.join(' + ') : g.offerTitle,
      products,
      productUnits,
      staffNames: [...staffSet],
      paymentModes,
      servicesMinor,
      productsMinor,
      totalMinor,
    });
  }

  return out.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
}

/** Filters sale rows by date range (`today`, `last_7_days`, `last_30_days`) and branch. */
export function filterSalesByWindow(
  rows: readonly SaleRow[],
  range: SalesRange,
  todayISO: string,
  branchId: string | null,
): SaleRow[] {
  const todayMs = new Date(`${todayISO}T00:00:00Z`).getTime();
  const daysBack = range === 'today' ? 0 : range === 'last_7_days' ? 6 : 29;
  const fromISO = new Date(todayMs - daysBack * 86_400_000).toISOString().slice(0, 10);

  return filterSalesByDateRange(rows, fromISO, todayISO, branchId);
}

/** Filters sale rows by explicit `[fromISO, toISO]` date bounds and branch. */
export function filterSalesByDateRange(
  rows: readonly SaleRow[],
  fromISO: string,
  toISO: string,
  branchId: string | null,
): SaleRow[] {
  const start = fromISO || '0000-01-01';
  const end = toISO && toISO >= start ? toISO : start;
  return rows.filter((r) => {
    if (branchId && r.locationId !== branchId) return false;
    return r.dayISO >= start && r.dayISO <= end;
  });
}

/** Filters sale rows by tab (`all`, `products`, `services`) and search query. */
export function filterSalesRows(rows: readonly SaleRow[], filter: SalesFilter, search: string): SaleRow[] {
  const pool = rows.filter((r) => {
    if (filter === 'products') return r.products.length > 0;
    if (filter === 'services') return r.serviceNames.length > 0;
    return true;
  });

  const q = search.trim().toLowerCase();
  if (!q) return pool;

  const tokens = q.split(/\s+/).filter(Boolean);
  const digits = q.replace(/\D/g, '');

  return pool.filter((r) => {
    const fields = [
      r.clientName,
      r.clientPhone ?? '',
      ...(filter !== 'products' ? [...r.serviceNames, r.offerTitle ?? ''] : []),
      ...(filter !== 'services' ? r.products.map((p) => p.name) : []),
      ...(filter === 'services' ? r.staffNames : []),
    ]
      .filter(Boolean)
      .map((f) => f.toLowerCase());

    const phoneDigits = (r.clientPhone ?? '').replace(/\D/g, '');
    if (digits.length >= 2 && digits === q.replace(/[\s+-]/g, '') && phoneDigits.includes(digits)) {
      return true;
    }

    return tokens.every(
      (tok) =>
        fields.some((f) => f.includes(tok)) ||
        (tok.replace(/\D/g, '').length >= 2 && phoneDigits.includes(tok.replace(/\D/g, ''))),
    );
  });
}

export interface SalesKpis {
  totalSalesMinor: number;
  billsCount: number;
  servicesRevenueMinor: number;
  servicesCount: number;
  productsRevenueMinor: number;
  productUnitsCount: number;
  byMode: Record<'upi' | 'cash' | 'card' | 'other' | 'notRecorded', number>;
}

export function computeSalesKpis(rows: readonly SaleRow[]): SalesKpis {
  let totalSalesMinor = 0;
  let servicesRevenueMinor = 0;
  let servicesCount = 0;
  let productsRevenueMinor = 0;
  let productUnitsCount = 0;
  const byMode: Record<'upi' | 'cash' | 'card' | 'other' | 'notRecorded', number> = {
    upi: 0,
    cash: 0,
    card: 0,
    other: 0,
    notRecorded: 0,
  };

  for (const r of rows) {
    totalSalesMinor += r.totalMinor;
    servicesRevenueMinor += r.servicesMinor;
    servicesCount += r.serviceNames.length;
    productsRevenueMinor += r.productsMinor;
    productUnitsCount += r.productUnits;

    const payments = r.group.payments ?? [];
    if (payments.length > 0) {
      for (const pm of payments) {
        const mode = pm.mode === 'upi' || pm.mode === 'cash' || pm.mode === 'card' ? pm.mode : 'other';
        byMode[mode] += Number(pm.amountMinor || 0);
      }
    } else if (r.paymentModes[0]) {
      const m = r.paymentModes[0];
      const mode = m === 'upi' || m === 'cash' || m === 'card' ? m : 'other';
      byMode[mode] += r.totalMinor;
    } else {
      byMode.notRecorded += r.totalMinor;
    }
  }

  return {
    totalSalesMinor,
    billsCount: rows.length,
    servicesRevenueMinor,
    servicesCount,
    productsRevenueMinor,
    productUnitsCount,
    byMode,
  };
}

export function SalesClient({
  appointments,
  timezone,
  todayISO,
  initialFrom,
  initialTo,
  initialFilter,
  initialRange: _initialRange,
  initialQuery,
  loadFailed,
}: {
  appointments: Appointment[];
  timezone: string;
  todayISO: string;
  initialFrom?: string;
  initialTo?: string;
  initialFilter: SalesFilter;
  initialRange: SalesRange;
  initialQuery: string;
  loadFailed: boolean;
}) {
  const t = useTranslations('sales');
  const tc = useTranslations('chrome');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  const router = useRouter();
  const branch = useBranch();
  const mayRecordPayment = useMayUse('visit.recordPayment');
  const providerWord = pickNoun(locale, useLabel('provider', 'Staff'), tn('staffTitle'));

  const [fromDate, setFromDate] = useState<string>(initialFrom ?? todayISO);
  const [toDate, setToDate] = useState<string>(initialTo ?? todayISO);
  const [filter, setFilter] = useState<SalesFilter>(initialFilter);
  const [search, setSearch] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [openBooking, setOpenBooking] = useState<BookingGroup | null>(null);

  const showServicesCol = filter !== 'products';
  const showProductsCol = filter !== 'services';
  const showStaffCol = filter === 'services';

  const applyDates = (nextFrom: string, nextTo: string) => {
    const safeFrom = nextFrom || todayISO;
    const safeTo = nextTo && nextTo >= safeFrom ? nextTo : safeFrom;
    setFromDate(safeFrom);
    setToDate(safeTo);
    setPage(1);
    const params = new URLSearchParams();
    params.set('date', safeFrom);
    params.set('to', safeTo);
    if (filter !== 'all') params.set('filter', filter);
    if (search.trim()) params.set('q', search.trim());
    router.replace(`/sales?${params.toString()}`, { scroll: false });
  };

  const allSaleRows = useMemo(() => buildSaleRows(appointments, timezone), [appointments, timezone]);

  const windowRows = useMemo(
    () => filterSalesByDateRange(allSaleRows, fromDate, toDate, branch.choice),
    [allSaleRows, fromDate, toDate, branch.choice],
  );

  const counts = useMemo(
    () => ({
      all: windowRows.length,
      products: windowRows.reduce((sum, r) => sum + r.productUnits, 0),
      services: windowRows.reduce((sum, r) => sum + r.serviceNames.length, 0),
    }),
    [windowRows],
  );

  const kpis = useMemo(() => computeSalesKpis(windowRows), [windowRows]);

  const filteredRows = useMemo(
    () => filterSalesRows(windowRows, filter, search),
    [windowRows, filter, search],
  );

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const formatPaymentMode = (modes: string[]) => {
    if (modes.length === 0) return t('notRecorded');
    return modes
      .map((m) =>
        m === 'cash' || m === 'card' || m === 'upi' || m === 'other'
          ? tc(`pay.${m}`)
          : m,
      )
      .join(' + ');
  };

  const formatWhen = (row: SaleRow) => {
    const time = formatTime(row.startAt, timezone);
    return `${formatDateShort(new Date(`${row.dayISO}T12:00:00`), undefined, locale)} · ${time}`;
  };

  const rowAmountMinor = (row: SaleRow) =>
    filter === 'products' ? row.productsMinor : filter === 'services' ? row.servicesMinor : row.totalMinor;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        menu
        actions={
          mayRecordPayment ? (
            <a className="btn" href="/appointments/new?purpose=payment">
              <IconReceipt /> {t('recordPayment')}
            </a>
          ) : null
        }
      />

      <div className="page-body sls-page">
        {loadFailed ? (
          <div className="sls-error" role="alert">
            <span>{t('loadFailed')}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>
              {t('retry')}
            </button>
          </div>
        ) : null}

        {/* Date Filter & Search Toolbar */}
        <div className="sls-toolbar">
          <div className="sls-dates" role="group" aria-label={t('title')}>
            <label className="sls-date-field">
              <span className="sls-date-label">{t('from')}</span>
              <input
                type="date"
                className="sls-date-input"
                aria-label={t('from')}
                value={fromDate}
                onChange={(e) => applyDates(e.target.value, toDate)}
              />
            </label>
            <label className="sls-date-field">
              <span className="sls-date-label">{t('to')}</span>
              <input
                type="date"
                className="sls-date-input"
                aria-label={t('to')}
                value={toDate}
                min={fromDate}
                onChange={(e) => applyDates(fromDate, e.target.value)}
              />
            </label>
          </div>

          <label className="search-wrap sls-search">
            <IconSearch />
            <input
              type="text"
              className="search-input search-input-bare"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="sls-kpis">
          <button
            type="button"
            className={`sls-kpi sls-kpi-tap ${filter === 'all' ? 'is-selected' : ''}`}
            aria-pressed={filter === 'all'}
            onClick={() => {
              setFilter('all');
              setPage(1);
            }}
          >
            <div className="sls-kpi-head">
              <span className="sls-kpi-icon sls-icon-green">
                <IconRupee />
              </span>
              <span className="sls-kpi-label">{t('kpi.totalSales')}</span>
            </div>
            <div className="sls-kpi-main">
              <strong className="sls-kpi-value">{formatMoney(String(kpis.totalSalesMinor))}</strong>
              <span className="sls-kpi-sub">{t('kpi.billsCount', { n: kpis.billsCount })}</span>
            </div>
          </button>

          <button
            type="button"
            className={`sls-kpi sls-kpi-tap ${filter === 'services' ? 'is-selected' : ''}`}
            aria-pressed={filter === 'services'}
            onClick={() => {
              setFilter(filter === 'services' ? 'all' : 'services');
              setPage(1);
            }}
          >
            <div className="sls-kpi-head">
              <span className="sls-kpi-icon sls-icon-blue">
                <IconServices />
              </span>
              <span className="sls-kpi-label">{t('kpi.servicesSold')}</span>
            </div>
            <div className="sls-kpi-main">
              <strong className="sls-kpi-value">{formatMoney(String(kpis.servicesRevenueMinor))}</strong>
              <span className="sls-kpi-sub">{t('kpi.servicesCount', { n: kpis.servicesCount })}</span>
            </div>
          </button>

          <button
            type="button"
            className={`sls-kpi sls-kpi-tap ${filter === 'products' ? 'is-selected' : ''}`}
            aria-pressed={filter === 'products'}
            onClick={() => {
              setFilter(filter === 'products' ? 'all' : 'products');
              setPage(1);
            }}
          >
            <div className="sls-kpi-head">
              <span className="sls-kpi-icon sls-icon-amber">
                <IconProducts />
              </span>
              <span className="sls-kpi-label">{t('kpi.productsSold')}</span>
            </div>
            <div className="sls-kpi-main">
              <strong className="sls-kpi-value">{formatMoney(String(kpis.productsRevenueMinor))}</strong>
              <span className="sls-kpi-sub">{t('kpi.unitsCount', { n: kpis.productUnitsCount })}</span>
            </div>
          </button>

          <div className="sls-kpi">
            <div className="sls-kpi-head">
              <span className="sls-kpi-icon sls-icon-purple">
                <IconReceipt />
              </span>
              <span className="sls-kpi-label">{t('kpi.paymentSplit')}</span>
            </div>
            <div className="sls-pay-modes">
              {(['upi', 'cash', 'card'] as const).map((m) => (
                <div key={m} className="sls-pay-line">
                  <span>{tc(`pay.${m}`)}</span>
                  <strong>{formatMoney(String(kpis.byMode[m]))}</strong>
                </div>
              ))}
              {kpis.byMode.other > 0 ? (
                <div className="sls-pay-line">
                  <span>{tc('pay.other')}</span>
                  <strong>{formatMoney(String(kpis.byMode.other))}</strong>
                </div>
              ) : null}
              {kpis.byMode.notRecorded > 0 ? (
                <div className="sls-pay-line">
                  <span>{t('notRecorded')}</span>
                  <strong>{formatMoney(String(kpis.byMode.notRecorded))}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="sls-chips" role="group" aria-label={t('title')}>
          {SALES_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`sls-chip ${filter === f ? 'is-on' : ''}`}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
            >
              {t(`filters.${f}`, { n: counts[f] })}
            </button>
          ))}
        </div>

        {/* Empty State or Sales Table / Cards */}
        {pageRows.length === 0 ? (
          <div className="sls-empty">
            <p className="sls-empty-title">
              {search.trim().length >= 2 ? t('empty.search', { q: search.trim() }) : t(`empty.${filter}`)}
            </p>
            <p className="sls-empty-hint">{t('empty.hint')}</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="sls-table-wrap">
              <table className="sls-table">
                <thead>
                  <tr>
                    <th>{t('cols.when')}</th>
                    <th>{t('cols.client')}</th>
                    {showServicesCol ? <th>{t('cols.services')}</th> : null}
                    {showProductsCol ? <th>{t('cols.products')}</th> : null}
                    {showStaffCol ? <th>{providerWord}</th> : null}
                    <th>{t('cols.payment')}</th>
                    <th className="is-num">{t('cols.total')}</th>
                    <th className="is-action">{t('cols.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const shownProducts = row.products.slice(0, MAX_ROW_PRODUCTS);
                    const hiddenProducts = row.products.length - shownProducts.length;
                    return (
                      <tr key={row.key}>
                        <td className="sls-col-when">{formatWhen(row)}</td>
                        <td>
                          <div className="sls-client">
                            <span className="sls-avatar">{initials(row.clientName)}</span>
                            <div className="sls-client-meta">
                              <strong className="sls-client-name">{row.clientName}</strong>
                              {row.clientPhone ? <span className="sls-client-phone">{row.clientPhone}</span> : null}
                            </div>
                          </div>
                        </td>
                        {showServicesCol ? (
                          <td>
                            <div className="sls-items">
                              {row.offerTitle ? (
                                <span className="sls-badge sls-badge-pkg">
                                  <IconPackages /> {row.offerTitle}
                                </span>
                              ) : null}
                              <span className="sls-service-list">{summarizeServices(row.serviceNames, locale) || '—'}</span>
                            </div>
                          </td>
                        ) : null}
                        {showProductsCol ? (
                          <td>
                            {row.products.length > 0 ? (
                              <div className="sls-product-chips">
                                {shownProducts.map((p, i) => (
                                  <span key={`${p.productId ?? p.name}-${i}`} className="sls-badge sls-badge-prd">
                                    <IconProducts />
                                    {p.qty > 1 ? `${p.name} × ${p.qty}` : p.name}
                                    <b className="sls-prd-price">{formatMoney(p.paidMinor)}</b>
                                  </span>
                                ))}
                                {hiddenProducts > 0 ? (
                                  <button
                                    type="button"
                                    className="sls-badge sls-badge-more"
                                    onClick={() => setOpenBooking(row.group)}
                                  >
                                    {t('moreProducts', { n: hiddenProducts })}
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <span className="sls-muted">{t('noProducts')}</span>
                            )}
                          </td>
                        ) : null}
                        {showStaffCol ? (
                          <td className="sls-col-staff">
                            {row.staffNames.length > 0 ? row.staffNames.join(', ') : <span className="sls-muted">{t('noStaff')}</span>}
                          </td>
                        ) : null}
                        <td>
                          <span className="sls-pay-pill">{formatPaymentMode(row.paymentModes)}</span>
                        </td>
                        <td className="is-num sls-col-total">{formatMoney(String(rowAmountMinor(row)))}</td>
                        <td className="is-action">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm sls-view-btn"
                            onClick={() => setOpenBooking(row.group)}
                          >
                            {t('view')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (≤ 860px, including 344px phone) */}
            <div className="sls-cards">
              {pageRows.map((row) => {
                const shownProducts = row.products.slice(0, MAX_ROW_PRODUCTS);
                const hiddenProducts = row.products.length - shownProducts.length;
                return (
                  <button
                    key={row.key}
                    type="button"
                    className="sls-card"
                    onClick={() => setOpenBooking(row.group)}
                  >
                    <div className="sls-card-top">
                      <div className="sls-client">
                        <span className="sls-avatar">{initials(row.clientName)}</span>
                        <div className="sls-client-meta">
                          <strong className="sls-client-name">{row.clientName}</strong>
                          <span className="sls-client-phone">
                            {formatWhen(row)}
                            {showStaffCol
                              ? ` · ${row.staffNames.length > 0 ? row.staffNames.join(', ') : t('noStaff')}`
                              : ''}
                          </span>
                        </div>
                      </div>
                      <div className="sls-card-right">
                        <strong className="sls-card-total">{formatMoney(String(rowAmountMinor(row)))}</strong>
                        <span className="sls-pay-pill">{formatPaymentMode(row.paymentModes)}</span>
                      </div>
                    </div>
                    <div className="sls-card-items">
                      {showServicesCol && row.offerTitle ? (
                        <span className="sls-badge sls-badge-pkg">
                          <IconPackages /> {row.offerTitle}
                        </span>
                      ) : null}
                      {showServicesCol && row.serviceNames.length > 0 ? (
                        <div className="sls-card-line">
                          <span className="sls-service-list">{summarizeServices(row.serviceNames, locale)}</span>
                        </div>
                      ) : null}
                      {showProductsCol && row.products.length > 0 ? (
                        <div className="sls-product-chips">
                          {shownProducts.map((p, i) => (
                            <span key={`${p.productId ?? p.name}-${i}`} className="sls-badge sls-badge-prd">
                              <IconProducts />
                              {p.qty > 1 ? `${p.name} × ${p.qty}` : p.name} ({formatMoney(p.paidMinor)})
                            </span>
                          ))}
                          {hiddenProducts > 0 ? (
                            <span className="sls-badge sls-badge-more">
                              {t('moreProducts', { n: hiddenProducts })}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <Pagination
              page={currentPage}
              total={filteredRows.length}
              pageSize={PAGE_SIZE}
              noun={t('paginationNoun')}
              onChange={setPage}
            />
          </>
        )}
      </div>

      {openBooking ? (
        <BookingSummary
          booking={openBooking}
          timezone={timezone}
          onClose={() => {
            setOpenBooking(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
