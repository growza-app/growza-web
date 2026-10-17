'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
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
  IconChevronDown,
  IconDownload,
  IconPackages,
  IconProducts,
  IconReceipt,
  IconRupee,
  IconSearch,
  IconServices,
} from '../components/icons';
import { csvLines } from '../lib/csv';
import { clampSalesDateRange, MAX_SALES_DATE_YEARS, MAX_SALES_EXPORT_ROWS } from './sales-helpers';

export { clampSalesDateRange, MAX_SALES_DATE_YEARS, MAX_SALES_EXPORT_ROWS };

export type SalesFilter = 'all' | 'products' | 'services';
export const SALES_FILTERS: readonly SalesFilter[] = ['all', 'products', 'services'];

export type SalesRange = 'today' | 'last_7_days' | 'last_30_days';
export const SALES_RANGES: readonly SalesRange[] = ['today', 'last_7_days', 'last_30_days'];

export const MAX_ROW_PRODUCTS = 2;

export interface SalesCsvHeaders {
  when: string;
  client: string;
  phone: string;
  branch?: string;
  services: string;
  products: string;
  staff: string;
  payment: string;
  total: string;
}

/**
 * High-performance single-pass CSV builder for filtered sales rows.
 * Enforces `MAX_SALES_EXPORT_ROWS` limit, reuses a single `Intl.DateTimeFormat` instance,
 * and writes major-unit numeric totals for spreadsheet arithmetic.
 */
export function buildSalesCsv(
  rows: readonly SaleRow[],
  timezone: string,
  headers: SalesCsvHeaders,
  formatPayment: (modes: string[]) => string,
  branchMap?: ReadonlyMap<string, string>,
  maxRows = MAX_SALES_EXPORT_ROWS,
  filter: SalesFilter = 'all',
): { csv: string; exportedCount: number; capped: boolean } {
  const limit = Math.max(0, maxRows);
  const slice = rows.length > limit ? rows.slice(0, limit) : rows;
  const timeFmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const includeBranch = Boolean(headers.branch && branchMap && branchMap.size > 0);
  const headRow: (string | number)[] = [
    headers.when,
    headers.client,
    headers.phone,
    ...(includeBranch ? [headers.branch!] : []),
    headers.services,
    headers.products,
    headers.staff,
    headers.payment,
    headers.total,
  ];

  const lines: (string | number | null | undefined)[][] = new Array(slice.length + 1);
  lines[0] = headRow;

  for (let i = 0; i < slice.length; i++) {
    const r = slice[i]!;
    const timeStr = timeFmt.format(new Date(r.startAt));
    const whenStr = `${r.dayISO} ${timeStr}`;
    const servicesStr = [
      ...(r.offerTitle ? [`[${r.offerTitle}]`] : []),
      ...r.serviceNames,
    ].join('; ');
    const productsStr = r.products
      .map((p) => (p.qty > 1 ? `${p.name} x${p.qty}` : p.name))
      .join('; ');
    const staffStr = r.staffNames.join(', ');
    const paymentStr = formatPayment(r.paymentModes);
    const amountMinor =
      filter === 'products' ? r.productsMinor : filter === 'services' ? r.servicesMinor : r.totalMinor;
    const totalMajor = (amountMinor / 100).toFixed(2);

    lines[i + 1] = [
      whenStr,
      r.clientName,
      r.clientPhone ?? '',
      ...(includeBranch ? [r.locationId ? (branchMap!.get(r.locationId) ?? '') : ''] : []),
      servicesStr,
      productsStr,
      staffStr,
      paymentStr,
      totalMajor,
    ];
  }

  return {
    csv: csvLines(lines),
    exportedCount: slice.length,
    capped: rows.length > limit,
  };
}

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

export function clientKeyOf(r: Pick<SaleRow, 'clientName' | 'clientPhone'>): string {
  return `${r.clientName}|${r.clientPhone ?? ''}`;
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
  branchId: string | readonly string[] | null,
): SaleRow[] {
  const todayMs = new Date(`${todayISO}T00:00:00Z`).getTime();
  const daysBack = range === 'today' ? 0 : range === 'last_7_days' ? 6 : 29;
  const fromISO = new Date(todayMs - daysBack * 86_400_000).toISOString().slice(0, 10);

  return filterSalesByDateRange(rows, fromISO, todayISO, branchId);
}

/** Filters sale rows by explicit `[fromISO, toISO]` date bounds and one or more branches. */
export function filterSalesByDateRange(
  rows: readonly SaleRow[],
  fromISO: string,
  toISO: string,
  branchId: string | readonly string[] | null,
): SaleRow[] {
  const start = fromISO || '0000-01-01';
  const end = toISO && toISO >= start ? toISO : start;
  const branchSet = Array.isArray(branchId)
    ? branchId.length > 0
      ? new Set(branchId)
      : null
    : typeof branchId === 'string' && branchId
      ? new Set([branchId])
      : null;
  return rows.filter((r) => {
    if (branchSet && (!r.locationId || !branchSet.has(r.locationId))) return false;
    return r.dayISO >= start && r.dayISO <= end;
  });
}

export interface SalesRowFilterExtra {
  selectedBranches?: readonly string[];
  selectedClients?: readonly string[];
  selectedServices?: readonly string[];
  selectedProducts?: readonly string[];
  selectedItems?: readonly string[];
  clientQuery?: string;
  serviceQuery?: string;
  productQuery?: string;
  itemQuery?: string;
}

/** Filters sale rows by tab (`all`, `products`, `services`), search query, and checkbox selections. */
export function filterSalesRows(
  rows: readonly SaleRow[],
  filter: SalesFilter,
  search: string,
  extra?: SalesRowFilterExtra,
): SaleRow[] {
  let pool = rows.filter((r) => {
    if (filter === 'products') return r.products.length > 0;
    if (filter === 'services') return r.serviceNames.length > 0;
    return true;
  });

  const selectedBranches = extra?.selectedBranches ?? [];
  if (selectedBranches.length > 0) {
    const branchSet = new Set(selectedBranches);
    pool = pool.filter((r) => Boolean(r.locationId && branchSet.has(r.locationId)));
  }

  const selectedClients = extra?.selectedClients ?? [];
  if (selectedClients.length > 0) {
    const clientSet = new Set(selectedClients);
    pool = pool.filter((r) => clientSet.has(clientKeyOf(r)));
  } else if (extra?.clientQuery?.trim()) {
    const cq = extra.clientQuery.trim().toLowerCase();
    const cTokens = cq.split(/\s+/).filter(Boolean);
    const cDigits = cq.replace(/\D/g, '');
    pool = pool.filter((r) => {
      const nameLow = r.clientName.toLowerCase();
      const phoneLow = (r.clientPhone ?? '').toLowerCase();
      const phoneDigits = (r.clientPhone ?? '').replace(/\D/g, '');
      if (cDigits.length >= 2 && cDigits === cq.replace(/[\s+-]/g, '') && phoneDigits.includes(cDigits)) return true;
      return cTokens.every(
        (tok) =>
          nameLow.includes(tok) ||
          phoneLow.includes(tok) ||
          (tok.replace(/\D/g, '').length >= 2 && phoneDigits.includes(tok.replace(/\D/g, ''))),
      );
    });
  }

  const selectedServices = extra?.selectedServices ?? [];
  if (filter !== 'products') {
    if (selectedServices.length > 0) {
      const srvSet = new Set(selectedServices);
      pool = pool.filter((r) => r.serviceNames.some((s) => srvSet.has(s)));
    } else if (extra?.serviceQuery?.trim()) {
      const sq = extra.serviceQuery.trim().toLowerCase();
      const sTokens = sq.split(/\s+/).filter(Boolean);
      pool = pool.filter((r) => {
        const srvFields = [...r.serviceNames, r.offerTitle ?? ''].filter(Boolean).map((f) => f.toLowerCase());
        return sTokens.every((tok) => srvFields.some((f) => f.includes(tok)));
      });
    }
  }

  const selectedProducts = extra?.selectedProducts ?? [];
  if (filter !== 'services') {
    if (selectedProducts.length > 0) {
      const prdSet = new Set(selectedProducts);
      pool = pool.filter((r) => r.products.some((p) => prdSet.has(p.name)));
    } else if (extra?.productQuery?.trim()) {
      const pq = extra.productQuery.trim().toLowerCase();
      const pTokens = pq.split(/\s+/).filter(Boolean);
      pool = pool.filter((r) => {
        const prdFields = r.products.map((p) => p.name.toLowerCase());
        return pTokens.every((tok) => prdFields.some((f) => f.includes(tok)));
      });
    }
  }

  const selectedItems = extra?.selectedItems ?? [];
  if (selectedItems.length > 0) {
    const itemSet = new Set(selectedItems);
    pool = pool.filter((r) => {
      const srvMatch = filter !== 'products' && r.serviceNames.some((s) => itemSet.has(`srv:${s}`));
      const prdMatch = filter !== 'services' && r.products.some((p) => itemSet.has(`prd:${p.name}`));
      return srvMatch || prdMatch;
    });
  } else if (extra?.itemQuery?.trim()) {
    const iq = extra.itemQuery.trim().toLowerCase();
    const iTokens = iq.split(/\s+/).filter(Boolean);
    pool = pool.filter((r) => {
      const itemFields = [
        ...(filter !== 'products' ? [...r.serviceNames, r.offerTitle ?? ''] : []),
        ...(filter !== 'services' ? r.products.map((p) => p.name) : []),
      ]
        .filter(Boolean)
        .map((f) => f.toLowerCase());
      return iTokens.every((tok) => itemFields.some((f) => f.includes(tok)));
    });
  }

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

export interface SalesChartBucket {
  key: string;
  label: string;
  fullLabel: string;
  servicesMinor: number;
  productsMinor: number;
  totalMinor: number;
  billsCount: number;
}

export interface SalesChartData {
  mode: 'hourly' | 'daily' | 'monthly';
  buckets: SalesChartBucket[];
  maxTotalMinor: number;
  peakIndex: number;
}

/**
 * Builds time-ordered stacked revenue buckets (Services + Products) for the Sales trend chart:
 * - `fromISO === toISO`: hourly buckets (`9a..9p`, widened if sales fall earlier/later)
 * - `2..31` days: daily buckets (`YYYY-MM-DD`)
 * - `> 31` days: monthly buckets (`YYYY-MM`)
 */
export function buildSalesChart(
  rows: readonly SaleRow[],
  fromISO: string,
  toISO: string,
  timezone: string,
  filter: SalesFilter = 'all',
  locale = 'en',
): SalesChartData {
  const start = fromISO || '0000-01-01';
  const end = toISO && toISO >= start ? toISO : start;

  const finalize = (mode: SalesChartData['mode'], buckets: SalesChartBucket[]): SalesChartData => {
    let maxTotalMinor = 0;
    let peakIndex = -1;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]!;
      if (b.totalMinor > maxTotalMinor) {
        maxTotalMinor = b.totalMinor;
        peakIndex = i;
      }
    }
    return { mode, buckets, maxTotalMinor, peakIndex };
  };

  if (start === end) {
    const hourFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const byHour = new Map<number, { srv: number; prd: number; count: number }>();
    let minH = 9;
    let maxH = 21;

    for (const r of rows) {
      const hRaw = Number(hourFmt.formatToParts(new Date(r.startAt)).find((p) => p.type === 'hour')?.value ?? 0);
      const h = Number.isFinite(hRaw) ? hRaw % 24 : 0;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
      const cur = byHour.get(h) ?? { srv: 0, prd: 0, count: 0 };
      if (filter !== 'products') cur.srv += r.servicesMinor;
      if (filter !== 'services') cur.prd += r.productsMinor;
      cur.count += 1;
      byHour.set(h, cur);
    }

    const buckets: SalesChartBucket[] = [];
    for (let h = minH; h <= maxH; h++) {
      const cur = byHour.get(h);
      const servicesMinor = cur?.srv ?? 0;
      const productsMinor = cur?.prd ?? 0;
      const label = h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
      const fullLabel = h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`;
      buckets.push({
        key: `h-${h}`,
        label,
        fullLabel,
        servicesMinor,
        productsMinor,
        totalMinor: servicesMinor + productsMinor,
        billsCount: cur?.count ?? 0,
      });
    }
    return finalize('hourly', buckets);
  }

  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const dayCount =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1)
      : 1;

  if (dayCount <= 31) {
    const byDay = new Map<string, { srv: number; prd: number; count: number }>();
    for (const r of rows) {
      const cur = byDay.get(r.dayISO) ?? { srv: 0, prd: 0, count: 0 };
      if (filter !== 'products') cur.srv += r.servicesMinor;
      if (filter !== 'services') cur.prd += r.productsMinor;
      cur.count += 1;
      byDay.set(r.dayISO, cur);
    }

    const buckets: SalesChartBucket[] = [];
    for (let i = 0; i < dayCount; i++) {
      const dayISO = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
      const cur = byDay.get(dayISO);
      const servicesMinor = cur?.srv ?? 0;
      const productsMinor = cur?.prd ?? 0;
      const fullLabel = formatDateShort(new Date(`${dayISO}T12:00:00Z`), 'UTC', locale);
      const label =
        dayCount <= 10 || i === 0 || i === dayCount - 1 || dayISO.endsWith('-01')
          ? fullLabel
          : String(Number(dayISO.slice(8, 10)));
      buckets.push({
        key: dayISO,
        label,
        fullLabel,
        servicesMinor,
        productsMinor,
        totalMinor: servicesMinor + productsMinor,
        billsCount: cur?.count ?? 0,
      });
    }
    return finalize('daily', buckets);
  }

  const byMonth = new Map<string, { srv: number; prd: number; count: number }>();
  for (const r of rows) {
    const ym = r.dayISO.slice(0, 7);
    const cur = byMonth.get(ym) ?? { srv: 0, prd: 0, count: 0 };
    if (filter !== 'products') cur.srv += r.servicesMinor;
    if (filter !== 'services') cur.prd += r.productsMinor;
    cur.count += 1;
    byMonth.set(ym, cur);
  }

  const monthFmt = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
  const [sy = 2026, sm = 1] = start.slice(0, 7).split('-').map(Number);
  const [ey = 2026, em = 1] = end.slice(0, 7).split('-').map(Number);
  const totalMonths = Math.min(60, Math.max(1, (ey - sy) * 12 + (em - sm) + 1));

  const buckets: SalesChartBucket[] = [];
  for (let i = 0; i < totalMonths; i++) {
    const d = new Date(Date.UTC(sy, sm - 1 + i, 15));
    const ym = d.toISOString().slice(0, 7);
    const cur = byMonth.get(ym);
    const servicesMinor = cur?.srv ?? 0;
    const productsMinor = cur?.prd ?? 0;
    const label = monthFmt.format(d);
    buckets.push({
      key: ym,
      label,
      fullLabel: label,
      servicesMinor,
      productsMinor,
      totalMinor: servicesMinor + productsMinor,
      billsCount: cur?.count ?? 0,
    });
  }
  return finalize('monthly', buckets);
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

  const initialBounds = useMemo(
    () => clampSalesDateRange(initialFrom ?? todayISO, initialTo ?? todayISO, todayISO),
    [initialFrom, initialTo, todayISO],
  );
  const minDateISO = initialBounds.minISO;

  const [fromDate, setFromDate] = useState<string>(initialBounds.fromISO);
  const [toDate, setToDate] = useState<string>(initialBounds.toISO);
  const [filter, setFilter] = useState<SalesFilter>(initialFilter);
  const [search, setSearch] = useState(initialQuery);
  const [selectedBranches, setSelectedBranches] = useState<string[]>(() =>
    branch.choice ? [branch.choice] : [],
  );
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [branchQuery, setBranchQuery] = useState('');
  const [clientQuery, setClientQuery] = useState(initialQuery);
  const [serviceQuery, setServiceQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [openDropdown, setOpenDropdown] = useState<'branches' | 'clients' | 'services' | 'products' | null>(null);
  const [chartOpen, setChartOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [openBooking, setOpenBooking] = useState<BookingGroup | null>(null);

  useEffect(() => {
    setFromDate(initialBounds.fromISO);
    setToDate(initialBounds.toISO);
  }, [initialBounds.fromISO, initialBounds.toISO]);

  useEffect(() => {
    setSelectedBranches(branch.choice ? [branch.choice] : []);
  }, [branch.choice]);

  useEffect(() => {
    if (!openDropdown) return;
    const onOutside = (e: MouseEvent | PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('.sls-dd'))) {
        setOpenDropdown(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('mousedown', onOutside, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [openDropdown]);

  const showServicesCol = filter !== 'products';
  const showProductsCol = filter !== 'services';
  const showStaffCol = filter === 'services';

  const applyDates = (nextFrom: string, nextTo: string) => {
    const { fromISO: safeFrom, toISO: safeTo } = clampSalesDateRange(nextFrom, nextTo, todayISO);
    setFromDate(safeFrom);
    setToDate(safeTo);
    setPage(1);
    const params = new URLSearchParams();
    params.set('date', safeFrom);
    params.set('to', safeTo);
    if (filter !== 'all') params.set('filter', filter);
    router.replace(`/sales?${params.toString()}`, { scroll: false });
  };

  const allSaleRows = useMemo(() => buildSaleRows(appointments, timezone), [appointments, timezone]);

  const effectiveBranches = branch.pinned ? branch.choice : selectedBranches;

  const windowRows = useMemo(
    () => filterSalesByDateRange(allSaleRows, fromDate, toDate, effectiveBranches),
    [allSaleRows, fromDate, toDate, effectiveBranches],
  );

  const branchOptions = useMemo(() => {
    const list = [...branch.branches].sort((a, b) => a.name.localeCompare(b.name));
    const bq = branchQuery.trim().toLowerCase();
    if (!bq) return list;
    return list.filter((b) => b.name.toLowerCase().includes(bq));
  }, [branch.branches, branchQuery]);

  const clientOptions = useMemo(() => {
    const seen = new Map<string, { key: string; name: string; phone: string | null }>();
    for (const r of windowRows) {
      const k = clientKeyOf(r);
      if (!seen.has(k)) seen.set(k, { key: k, name: r.clientName, phone: r.clientPhone });
    }
    const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    const cq = clientQuery.trim().toLowerCase();
    if (!cq) return list;
    const cDigits = cq.replace(/\D/g, '');
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(cq) ||
        (c.phone ?? '').toLowerCase().includes(cq) ||
        (cDigits.length >= 2 && (c.phone ?? '').replace(/\D/g, '').includes(cDigits)),
    );
  }, [windowRows, clientQuery]);

  const serviceOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of windowRows) {
      for (const s of r.serviceNames) seen.add(s);
    }
    const list = [...seen].sort((a, b) => a.localeCompare(b));
    const sq = serviceQuery.trim().toLowerCase();
    if (!sq) return list;
    return list.filter((s) => s.toLowerCase().includes(sq));
  }, [windowRows, serviceQuery]);

  const productOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of windowRows) {
      for (const p of r.products) seen.add(p.name);
    }
    const list = [...seen].sort((a, b) => a.localeCompare(b));
    const pq = productQuery.trim().toLowerCase();
    if (!pq) return list;
    return list.filter((p) => p.toLowerCase().includes(pq));
  }, [windowRows, productQuery]);

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
    () =>
      filterSalesRows(windowRows, filter, search, {
        selectedClients,
        selectedServices,
        selectedProducts,
        clientQuery,
        serviceQuery,
        productQuery,
      }),
    [windowRows, filter, search, selectedClients, selectedServices, selectedProducts, clientQuery, serviceQuery, productQuery],
  );

  const chartData = useMemo(
    () => buildSalesChart(filteredRows, fromDate, toDate, timezone, filter, locale),
    [filteredRows, fromDate, toDate, timezone, filter, locale],
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

  const toggleBranch = (id: string) => {
    setSelectedBranches((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));
    setPage(1);
  };

  const toggleClient = (key: string) => {
    setSelectedClients((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    setPage(1);
  };

  const toggleService = (name: string) => {
    setSelectedServices((prev) => (prev.includes(name) ? prev.filter((k) => k !== name) : [...prev, name]));
    setPage(1);
  };

  const toggleProduct = (name: string) => {
    setSelectedProducts((prev) => (prev.includes(name) ? prev.filter((k) => k !== name) : [...prev, name]));
    setPage(1);
  };

  const branchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branch.branches) map.set(b.id, b.name);
    return map;
  }, [branch.branches]);

  const exportCsv = () => {
    if (filteredRows.length === 0) return;
    const { csv } = buildSalesCsv(
      filteredRows,
      timezone,
      {
        when: t('cols.when'),
        client: t('cols.client'),
        phone: t('cols.phone'),
        branch: branch.branches.length > 1 ? t('branchFilter') : undefined,
        services: t('cols.services'),
        products: t('cols.products'),
        staff: providerWord,
        payment: t('cols.payment'),
        total: t('cols.total'),
      },
      formatPaymentMode,
      branchMap,
      MAX_SALES_EXPORT_ROWS,
      filter,
    );
    const filename = `sales-${fromDate}-to-${toDate}.csv`;
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        menu
        actions={
          mayRecordPayment ? (
            <a
              className="btn"
              href="/appointments/new?purpose=payment"
              onClick={() => {
                if (!branch.pinned && selectedBranches.length === 1) {
                  branch.setBranch(selectedBranches[0]!);
                }
              }}
            >
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

        {/* Date Filter & Checkbox Filter Toolbar */}
        <div className="sls-toolbar">
          <div className="sls-dates" role="group" aria-label={t('title')}>
            <label className="sls-date-field">
              <span className="sls-date-label">{t('from')}</span>
              <input
                type="date"
                className="sls-date-input"
                aria-label={t('from')}
                value={fromDate}
                min={minDateISO}
                max={todayISO}
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
                min={fromDate >= minDateISO ? fromDate : minDateISO}
                max={todayISO}
                onChange={(e) => applyDates(fromDate, e.target.value)}
              />
            </label>
          </div>

          <div className="sls-filter-bar">
            {/* 0. Branch multi-select checkbox + search filter */}
            {!branch.pinned ? (
              <div className="sls-dd">
                <button
                  type="button"
                  className={`sls-dd-btn ${selectedBranches.length > 0 ? 'is-active' : ''}`}
                  aria-expanded={openDropdown === 'branches'}
                  onClick={() => setOpenDropdown((v) => (v === 'branches' ? null : 'branches'))}
                >
                  <span>
                    {t('branchFilter')}
                    {selectedBranches.length > 0 ? ` (${selectedBranches.length})` : ''}
                  </span>
                  <IconChevronDown />
                </button>

                {openDropdown === 'branches' ? (
                  <div className="sls-dd-menu" role="group" aria-label={t('branchFilter')}>
                    <div className="sls-dd-head">
                      <label className="search-wrap sls-dd-search">
                        <IconSearch />
                        <input
                          type="text"
                          className="search-input search-input-bare"
                          placeholder={t('branchSearchPlaceholder')}
                          value={branchQuery}
                          onChange={(e) => setBranchQuery(e.target.value)}
                        />
                      </label>
                      {selectedBranches.length > 0 || branchQuery.trim() ? (
                        <button
                          type="button"
                          className="sls-dd-clear"
                          onClick={() => {
                            setSelectedBranches([]);
                            setBranchQuery('');
                            setPage(1);
                          }}
                        >
                          {t('clearFilter')}
                        </button>
                      ) : null}
                    </div>
                    <div className="sls-dd-list">
                      {branchOptions.length === 0 ? (
                        <div className="sls-dd-empty">{t('noFilterMatches')}</div>
                      ) : (
                        branchOptions.map((b) => {
                          const checked = selectedBranches.includes(b.id);
                          return (
                            <label key={b.id} className="sls-check-row">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleBranch(b.id)}
                              />
                              <span className="sls-check-main">{b.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 1. Client / Phone checkbox + search filter */}
            <div className="sls-dd">
              <button
                type="button"
                className={`sls-dd-btn ${selectedClients.length > 0 || clientQuery.trim() ? 'is-active' : ''}`}
                aria-expanded={openDropdown === 'clients'}
                onClick={() => setOpenDropdown((v) => (v === 'clients' ? null : 'clients'))}
              >
                <span>
                  {t('clientFilter')}
                  {selectedClients.length > 0 ? ` (${selectedClients.length})` : ''}
                </span>
                <IconChevronDown />
              </button>

              {openDropdown === 'clients' ? (
                <div className="sls-dd-menu" role="group" aria-label={t('clientFilter')}>
                  <div className="sls-dd-head">
                    <label className="search-wrap sls-dd-search">
                      <IconSearch />
                      <input
                        type="text"
                        className="search-input search-input-bare"
                        placeholder={t('clientSearchPlaceholder')}
                        value={clientQuery}
                        onChange={(e) => {
                          setClientQuery(e.target.value);
                          setSearch('');
                          setPage(1);
                        }}
                      />
                    </label>
                    {selectedClients.length > 0 || clientQuery.trim() ? (
                      <button
                        type="button"
                        className="sls-dd-clear"
                        onClick={() => {
                          setSelectedClients([]);
                          setClientQuery('');
                          setSearch('');
                          setPage(1);
                        }}
                      >
                        {t('clearFilter')}
                      </button>
                    ) : null}
                  </div>
                  <div className="sls-dd-list">
                    {clientOptions.length === 0 ? (
                      <div className="sls-dd-empty">{t('noFilterMatches')}</div>
                    ) : (
                      clientOptions.map((c) => {
                        const checked = selectedClients.includes(c.key);
                        return (
                          <label key={c.key} className="sls-check-row">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleClient(c.key)}
                            />
                            <span className="sls-check-main">{c.name}</span>
                            {c.phone ? <span className="sls-check-sub">{c.phone}</span> : null}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* 2. Services checkbox + search filter */}
            {showServicesCol ? (
              <div className="sls-dd">
                <button
                  type="button"
                  className={`sls-dd-btn ${selectedServices.length > 0 || serviceQuery.trim() ? 'is-active' : ''}`}
                  aria-expanded={openDropdown === 'services'}
                  onClick={() => setOpenDropdown((v) => (v === 'services' ? null : 'services'))}
                >
                  <span>
                    {t('itemFilterServices')}
                    {selectedServices.length > 0 ? ` (${selectedServices.length})` : ''}
                  </span>
                  <IconChevronDown />
                </button>

                {openDropdown === 'services' ? (
                  <div className="sls-dd-menu" role="group" aria-label={t('itemFilterServices')}>
                    <div className="sls-dd-head">
                      <label className="search-wrap sls-dd-search">
                        <IconSearch />
                        <input
                          type="text"
                          className="search-input search-input-bare"
                          placeholder={t('serviceSearchPlaceholder')}
                          value={serviceQuery}
                          onChange={(e) => {
                            setServiceQuery(e.target.value);
                            setPage(1);
                          }}
                        />
                      </label>
                      {selectedServices.length > 0 || serviceQuery.trim() ? (
                        <button
                          type="button"
                          className="sls-dd-clear"
                          onClick={() => {
                            setSelectedServices([]);
                            setServiceQuery('');
                            setPage(1);
                          }}
                        >
                          {t('clearFilter')}
                        </button>
                      ) : null}
                    </div>
                    <div className="sls-dd-list">
                      {serviceOptions.length === 0 ? (
                        <div className="sls-dd-empty">{t('noFilterMatches')}</div>
                      ) : (
                        serviceOptions.map((srv) => {
                          const checked = selectedServices.includes(srv);
                          return (
                            <label key={srv} className="sls-check-row">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleService(srv)}
                              />
                              <span className="sls-check-main">{srv}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 3. Products checkbox + search filter */}
            {showProductsCol ? (
              <div className="sls-dd">
                <button
                  type="button"
                  className={`sls-dd-btn ${selectedProducts.length > 0 || productQuery.trim() ? 'is-active' : ''}`}
                  aria-expanded={openDropdown === 'products'}
                  onClick={() => setOpenDropdown((v) => (v === 'products' ? null : 'products'))}
                >
                  <span>
                    {t('itemFilterProducts')}
                    {selectedProducts.length > 0 ? ` (${selectedProducts.length})` : ''}
                  </span>
                  <IconChevronDown />
                </button>

                {openDropdown === 'products' ? (
                  <div className="sls-dd-menu" role="group" aria-label={t('itemFilterProducts')}>
                    <div className="sls-dd-head">
                      <label className="search-wrap sls-dd-search">
                        <IconSearch />
                        <input
                          type="text"
                          className="search-input search-input-bare"
                          placeholder={t('productSearchPlaceholder')}
                          value={productQuery}
                          onChange={(e) => {
                            setProductQuery(e.target.value);
                            setPage(1);
                          }}
                        />
                      </label>
                      {selectedProducts.length > 0 || productQuery.trim() ? (
                        <button
                          type="button"
                          className="sls-dd-clear"
                          onClick={() => {
                            setSelectedProducts([]);
                            setProductQuery('');
                            setPage(1);
                          }}
                        >
                          {t('clearFilter')}
                        </button>
                      ) : null}
                    </div>
                    <div className="sls-dd-list">
                      {productOptions.length === 0 ? (
                        <div className="sls-dd-empty">{t('noFilterMatches')}</div>
                      ) : (
                        productOptions.map((prd) => {
                          const checked = selectedProducts.includes(prd);
                          return (
                            <label key={prd} className="sls-check-row">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleProduct(prd)}
                              />
                              <span className="sls-check-main">{prd}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
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

        {/* Collapsible Sales Trend Chart */}
        <section className="sls-chart-card" aria-label={t('chart.title')}>
          <div className="sls-chart-head">
            <div className="sls-chart-title-wrap">
              <h2 className="sls-chart-title">{t('chart.title')}</h2>
              <span className="sls-chart-mode">{t(`chart.${chartData.mode}`)}</span>
            </div>

            <div className="sls-chart-controls">
              {chartOpen ? (
                <div className="sls-chart-legend" aria-hidden="true">
                  {filter !== 'products' ? (
                    <span className="sls-legend-item">
                      <span className="sls-legend-dot sls-dot-srv" />
                      {t('itemFilterServices')}
                    </span>
                  ) : null}
                  {filter !== 'services' ? (
                    <span className="sls-legend-item">
                      <span className="sls-legend-dot sls-dot-prd" />
                      {t('itemFilterProducts')}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                className="btn btn-ghost btn-sm sls-chart-toggle"
                aria-expanded={chartOpen}
                onClick={() => setChartOpen((v) => !v)}
              >
                <span>{chartOpen ? t('chart.hide') : t('chart.show')}</span>
                <IconChevronDown />
              </button>
            </div>
          </div>

          {chartOpen ? (
            chartData.maxTotalMinor === 0 ? (
              <p className="sls-chart-empty">{t(`empty.${filter}`)}</p>
            ) : (
              <div className="sls-chart-bars" role="list" aria-label={t('chart.title')}>
                {chartData.buckets.map((b, idx) => {
                  const pct =
                    b.totalMinor > 0
                      ? Math.max(8, Math.round((b.totalMinor / chartData.maxTotalMinor) * 78))
                      : 3;
                  const isPeak = idx === chartData.peakIndex;
                  const srvShare = b.totalMinor > 0 ? Math.round((b.servicesMinor / b.totalMinor) * 100) : 0;
                  const prdShare = b.totalMinor > 0 ? 100 - srvShare : 0;
                  const tipText = `${b.fullLabel} · ${formatMoney(String(b.totalMinor))} (${t('kpi.billsCount', { n: b.billsCount })})`;
                  return (
                    <div
                      key={b.key}
                      role="listitem"
                      aria-label={tipText}
                      title={tipText}
                      className={`sls-chart-col ${isPeak ? 'is-peak' : ''} ${b.totalMinor === 0 ? 'is-zero' : ''}`}
                    >
                      <div className="sls-chart-track">
                        {isPeak ? (
                          <span className="sls-chart-peak" style={{ bottom: `calc(${pct}% + 5px)` }}>
                            {formatMoney(String(b.totalMinor))}
                          </span>
                        ) : null}
                        <span className="sls-chart-stack" style={{ height: `${pct}%` }}>
                          {prdShare > 0 ? (
                            <span className="sls-bar-seg sls-bar-prd" style={{ height: `${prdShare}%` }} />
                          ) : null}
                          {srvShare > 0 ? (
                            <span className="sls-bar-seg sls-bar-srv" style={{ height: `${srvShare}%` }} />
                          ) : null}
                        </span>
                      </div>
                      <span className="sls-chart-lbl">{b.label}</span>
                    </div>
                  );
                })}
              </div>
            )
          ) : null}
        </section>

        {/* Filter Tabs + Top-Right Export CSV */}
        <div className="sls-table-head-bar">
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

          <button
            type="button"
            className="btn btn-ghost btn-sm sls-export-btn"
            disabled={filteredRows.length === 0}
            title={
              filteredRows.length > MAX_SALES_EXPORT_ROWS
                ? t('exportCsvLimit', { max: MAX_SALES_EXPORT_ROWS })
                : t('exportCsv')
            }
            onClick={exportCsv}
          >
            <IconDownload />
            <span>{t('exportCsv')}</span>
          </button>
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
