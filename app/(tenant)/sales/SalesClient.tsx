'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatMoney, formatTime, type Appointment } from '../lib/api';
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
  IconAnalytics,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconDownload,
  IconPackages,
  IconProducts,
  IconReceipt,
  IconReturn,
  IconRupee,
  IconSearch,
  IconServices,
  IconUserPlus,
} from '../components/icons';
import { csvLines } from '../lib/csv';
import { useBarcodeScan } from '../lib/barcode-scan';
import { ReturnProductSheet } from './ReturnProductSheet';
import {
  clampSalesDateRange,
  computeReturnWindow,
  DEFAULT_PRODUCT_RETURN_WINDOW_DAYS,
  findProductLineByCode,
  lineNetPaidMinor,
  lineRefundMinorForQty,
  lineRemainingQty,
  lineReturnId,
  MAX_SALES_DATE_YEARS,
  MAX_SALES_EXPORT_ROWS,
  visitKeyFromGroupKey,
} from './sales-helpers';

export {
  clampSalesDateRange,
  computeReturnWindow,
  DEFAULT_PRODUCT_RETURN_WINDOW_DAYS,
  findProductLineByCode,
  lineNetPaidMinor,
  lineRefundMinorForQty,
  lineRemainingQty,
  lineReturnId,
  MAX_SALES_DATE_YEARS,
  MAX_SALES_EXPORT_ROWS,
  visitKeyFromGroupKey,
};

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
  returnedUnits: number;
  staffNames: string[];
  paymentModes: string[];
  servicesMinor: number;
  productsMinor: number;
  returnedMinor: number;
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
    const productsMinor = products.reduce((sum, p) => sum + lineNetPaidMinor(p), 0);
    const returnedMinor = products.reduce((sum, p) => sum + Math.max(0, Number(p.returnedMinor || 0)), 0);
    const totalMinor = servicesMinor + productsMinor;
    const productUnits = products.reduce((sum, p) => sum + lineRemainingQty(p), 0);
    const returnedUnits = products.reduce((sum, p) => sum + Math.max(0, Number(p.returnedQty || 0)), 0);

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
      returnedUnits,
      staffNames: [...staffSet],
      paymentModes,
      servicesMinor,
      productsMinor,
      returnedMinor,
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
        const prdFields = r.products
          .flatMap((p) => [p.name, p.sku ?? '', p.barcode ?? ''])
          .filter(Boolean)
          .map((s) => s.toLowerCase());
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
        ...(filter !== 'services' ? r.products.flatMap((p) => [p.name, p.sku ?? '', p.barcode ?? '']) : []),
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
      ...(filter !== 'services' ? r.products.flatMap((p) => [p.name, p.sku ?? '', p.barcode ?? '']) : []),
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

    const modeOf = (m: string) => (m === 'upi' || m === 'cash' || m === 'card' ? m : 'other');
    const payments = r.group.payments ?? [];
    // Owner review, 2026-10-19 — what came in is what was paid; what went out is the way each refund was paid out
    // (`refunds`, from the API's product_return rows), so a UPI sale refunded in cash is UPI in and cash out, which is
    // what the drawer shows. An API that predates `refunds` sends none, and then the refund is taken off the ways in
    // the order they are listed, as before.
    const refunds = r.group.refunds;
    const refundedMinor = (refunds ?? []).reduce((sum, rf) => sum + Math.max(0, Number(rf.amountMinor || 0)), 0);
    if (payments.length > 0) {
      let remRefund = refunds === undefined ? r.returnedMinor : 0;
      for (const pm of payments) {
        const rawAmt = Math.max(0, Number(pm.amountMinor || 0));
        const deduct = Math.min(rawAmt, remRefund);
        remRefund -= deduct;
        byMode[modeOf(pm.mode)] += rawAmt - deduct;
      }
    } else if (r.paymentModes[0]) {
      byMode[modeOf(r.paymentModes[0])] += r.totalMinor + refundedMinor;
    } else {
      byMode.notRecorded += r.totalMinor + refundedMinor;
    }
    for (const rf of refunds ?? []) byMode[modeOf(rf.mode)] -= Math.max(0, Number(rf.amountMinor || 0));
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

export function computeDeltaPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export interface SalesQuickStats {
  avgBillMinor: number;
  avgBillDeltaPct: number | null;
  clientsCount: number;
  clientsDeltaPct: number | null;
  topService: { name: string; count: number } | null;
  topProduct: { name: string; units: number } | null;
}

export function computeSalesQuickStats(
  rows: readonly SaleRow[],
  prevRows: readonly SaleRow[] = [],
): SalesQuickStats {
  const totalSalesMinor = rows.reduce((sum, r) => sum + r.totalMinor, 0);
  const avgBillMinor = rows.length > 0 ? Math.round(totalSalesMinor / rows.length) : 0;

  const prevTotalMinor = prevRows.reduce((sum, r) => sum + r.totalMinor, 0);
  const prevAvgMinor = prevRows.length > 0 ? Math.round(prevTotalMinor / prevRows.length) : 0;
  const avgBillDeltaPct = computeDeltaPct(avgBillMinor, prevAvgMinor);

  const clientsCount = new Set(rows.map((r) => clientKeyOf(r))).size;
  const prevClientsCount = new Set(prevRows.map((r) => clientKeyOf(r))).size;
  const clientsDeltaPct = computeDeltaPct(clientsCount, prevClientsCount);

  const srvCounts = new Map<string, number>();
  const prdCounts = new Map<string, number>();
  for (const r of rows) {
    for (const s of r.serviceNames) {
      srvCounts.set(s, (srvCounts.get(s) ?? 0) + 1);
    }
    for (const p of r.products) {
      const netUnits = lineRemainingQty(p);
      if (netUnits > 0) {
        prdCounts.set(p.name, (prdCounts.get(p.name) ?? 0) + netUnits);
      }
    }
  }

  let topService: { name: string; count: number } | null = null;
  for (const [name, count] of srvCounts.entries()) {
    if (!topService || count > topService.count || (count === topService.count && name.localeCompare(topService.name) < 0)) {
      topService = { name, count };
    }
  }

  let topProduct: { name: string; units: number } | null = null;
  for (const [name, units] of prdCounts.entries()) {
    if (!topProduct || units > topProduct.units || (units === topProduct.units && name.localeCompare(topProduct.name) < 0)) {
      topProduct = { name, units };
    }
  }

  return {
    avgBillMinor,
    avgBillDeltaPct,
    clientsCount,
    clientsDeltaPct,
    topService,
    topProduct,
  };
}

export function formatAxisRupees(minor: number): string {
  const rupees = Math.round(minor / 100);
  if (rupees <= 0) return '₹0';
  if (rupees >= 100_000) {
    const lakhs = rupees / 100_000;
    return `₹${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)}L`;
  }
  if (rupees >= 1_000) {
    const k = rupees / 1_000;
    return `₹${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return `₹${rupees}`;
}

function computeChartYAxis(maxTotalMinor: number): {
  yMaxMinor: number;
  yTicks: { valueMinor: number; label: string }[];
} {
  const maxRupees = Math.max(0, Math.ceil(maxTotalMinor / 100));
  const targetRupees = Math.max(400, Math.ceil(maxRupees * 1.1));
  const rawStep = targetRupees / 4;
  const steps = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000];
  const stepRupees = steps.find((s) => s >= rawStep) ?? Math.ceil(rawStep / 500000) * 500000;
  const yMaxMinor = stepRupees * 4 * 100;
  const yTicks = [4, 3, 2, 1, 0].map((mult) => {
    const valueMinor = mult * stepRupees * 100;
    return { valueMinor, label: formatAxisRupees(valueMinor) };
  });
  return { yMaxMinor, yTicks };
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
  mode: 'daily' | 'weekly' | 'monthly' | 'yearly';
  rangeLabel: string;
  buckets: SalesChartBucket[];
  maxTotalMinor: number;
  yMaxMinor: number;
  yTicks: { valueMinor: number; label: string }[];
  peakIndex: number;
}

/**
 * Builds date-ordered stacked revenue buckets (Services + Products) synced with `[fromISO, toISO]`:
 * - `1..31` days (including `fromISO === toISO`): daily date buckets (`YYYY-MM-DD`)
 * - `32..92` days (up to ~3 months): weekly 7-day buckets bounded to `[fromISO, toISO]`
 * - `93..730` days (> 3 months up to 2 years, including 1 year): monthly buckets (`YYYY-MM`)
 * - `> 730` days (> 2 years): yearly buckets (`YYYY`)
 */
export function buildSalesChart(
  rows: readonly SaleRow[],
  fromISO: string,
  toISO: string,
  _timezone: string,
  filter: SalesFilter = 'all',
  locale = 'en',
): SalesChartData {
  const start = fromISO || '0000-01-01';
  const end = toISO && toISO >= start ? toISO : start;
  const crossYear = start.slice(0, 4) !== end.slice(0, 4);
  const startShort = formatDateShort(new Date(`${start}T12:00:00Z`), 'UTC', locale);
  const endShort = formatDateShort(new Date(`${end}T12:00:00Z`), 'UTC', locale);
  const rangeLabel =
    start === end
      ? startShort
      : crossYear
        ? `${startShort} '${start.slice(2, 4)} – ${endShort} '${end.slice(2, 4)}`
        : `${startShort} – ${endShort}`;

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
    const { yMaxMinor, yTicks } = computeChartYAxis(maxTotalMinor);
    return { mode, rangeLabel, buckets, maxTotalMinor, yMaxMinor, yTicks, peakIndex };
  };

  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const dayCount =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1)
      : 1;

  if (dayCount <= 31) {
    const byDay = new Map<string, { srv: number; prd: number; count: number }>();
    for (const r of rows) {
      if (r.dayISO < start || r.dayISO > end) continue;
      if (filter === 'products' && r.products.length === 0) continue;
      if (filter === 'services' && r.serviceNames.length === 0) continue;
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
      buckets.push({
        key: dayISO,
        label: fullLabel,
        fullLabel,
        servicesMinor,
        productsMinor,
        totalMinor: servicesMinor + productsMinor,
        billsCount: cur?.count ?? 0,
      });
    }
    return finalize('daily', buckets);
  }

  if (dayCount <= 92) {
    const weekCount = Math.ceil(dayCount / 7);
    const weekTotals = Array.from({ length: weekCount }, () => ({ srv: 0, prd: 0, count: 0 }));
    for (const r of rows) {
      if (r.dayISO < start || r.dayISO > end) continue;
      if (filter === 'products' && r.products.length === 0) continue;
      if (filter === 'services' && r.serviceNames.length === 0) continue;
      const rowMs = Date.parse(`${r.dayISO}T00:00:00Z`);
      if (!Number.isFinite(rowMs)) continue;
      const offsetDays = Math.max(0, Math.floor((rowMs - startMs) / 86_400_000));
      const idx = Math.min(weekCount - 1, Math.floor(offsetDays / 7));
      const cur = weekTotals[idx]!;
      if (filter !== 'products') cur.srv += r.servicesMinor;
      if (filter !== 'services') cur.prd += r.productsMinor;
      cur.count += 1;
    }

    const buckets: SalesChartBucket[] = [];
    for (let w = 0; w < weekCount; w++) {
      const wStartMs = startMs + w * 7 * 86_400_000;
      const wEndMs = Math.min(endMs, wStartMs + 6 * 86_400_000);
      const wStartISO = new Date(wStartMs).toISOString().slice(0, 10);
      const wEndISO = new Date(wEndMs).toISOString().slice(0, 10);
      const wStartShort = formatDateShort(new Date(`${wStartISO}T12:00:00Z`), 'UTC', locale);
      const wEndShort = formatDateShort(new Date(`${wEndISO}T12:00:00Z`), 'UTC', locale);
      const sameMonth = wStartISO.slice(0, 7) === wEndISO.slice(0, 7);
      const startDayNum = String(Number(wStartISO.slice(8, 10)));
      const label =
        wStartISO === wEndISO
          ? wStartShort
          : sameMonth
            ? `${startDayNum}–${wEndShort}`
            : `${wStartShort}–${wEndShort}`;
      const fullLabel = wStartISO === wEndISO ? wStartShort : `${wStartShort} – ${wEndShort}`;
      const cur = weekTotals[w]!;
      buckets.push({
        key: `${wStartISO}..${wEndISO}`,
        label,
        fullLabel,
        servicesMinor: cur.srv,
        productsMinor: cur.prd,
        totalMinor: cur.srv + cur.prd,
        billsCount: cur.count,
      });
    }
    return finalize('weekly', buckets);
  }

  if (dayCount <= 730) {
    const byMonth = new Map<string, { srv: number; prd: number; count: number }>();
    for (const r of rows) {
      if (r.dayISO < start || r.dayISO > end) continue;
      if (filter === 'products' && r.products.length === 0) continue;
      if (filter === 'services' && r.serviceNames.length === 0) continue;
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
    const totalMonths = Math.min(24, Math.max(1, (ey - sy) * 12 + (em - sm) + 1));

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

  const byYear = new Map<string, { srv: number; prd: number; count: number }>();
  for (const r of rows) {
    if (r.dayISO < start || r.dayISO > end) continue;
    if (filter === 'products' && r.products.length === 0) continue;
    if (filter === 'services' && r.serviceNames.length === 0) continue;
    const yr = r.dayISO.slice(0, 4);
    const cur = byYear.get(yr) ?? { srv: 0, prd: 0, count: 0 };
    if (filter !== 'products') cur.srv += r.servicesMinor;
    if (filter !== 'services') cur.prd += r.productsMinor;
    cur.count += 1;
    byYear.set(yr, cur);
  }

  const sy = Number(start.slice(0, 4)) || 2026;
  const ey = Math.max(sy, Number(end.slice(0, 4)) || sy);
  const buckets: SalesChartBucket[] = [];
  for (let yr = sy; yr <= ey; yr++) {
    const key = String(yr);
    const cur = byYear.get(key);
    const servicesMinor = cur?.srv ?? 0;
    const productsMinor = cur?.prd ?? 0;
    buckets.push({
      key,
      label: key,
      fullLabel: key,
      servicesMinor,
      productsMinor,
      totalMinor: servicesMinor + productsMinor,
      billsCount: cur?.count ?? 0,
    });
  }
  return finalize('yearly', buckets);
}

export function SalesClient({
  appointments,
  timezone,
  todayISO,
  returnWindowDays = DEFAULT_PRODUCT_RETURN_WINDOW_DAYS,
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
  returnWindowDays?: number;
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
  const fromInputRef = useRef<HTMLInputElement>(null);

  const initialBounds = useMemo(
    () => clampSalesDateRange(initialFrom ?? todayISO, initialTo ?? todayISO, todayISO),
    [initialFrom, initialTo, todayISO],
  );
  const minDateISO = initialBounds.minISO;

  const [loadedAppointments, setLoadedAppointments] = useState<Appointment[]>(appointments);
  const fetchSeqRef = useRef(0);
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
  const [returnSheet, setReturnSheet] = useState<{ open: boolean; bill: SaleRow | null; scannedCode: string }>({
    open: false,
    bill: null,
    scannedCode: '',
  });

  useEffect(() => {
    setLoadedAppointments(appointments);
  }, [appointments]);

  useEffect(() => {
    setFromDate(initialBounds.fromISO);
    setToDate(initialBounds.toISO);
  }, [initialBounds.fromISO, initialBounds.toISO]);

  useEffect(() => {
    setSelectedBranches(branch.choice ? [branch.choice] : []);
  }, [branch.choice]);

  /*
   * Owner, 2026-10-19 — a return is only ever started with the Return button; a scan here is a sale. The scan used to
   * open the Return sheet, so a bottle that had been returned and was scanned to sell again opened the old bill.
   */
  useBarcodeScan(mayRecordPayment && !returnSheet.open && !openBooking, (code) => {
    router.push(`/products/sell?scan=${encodeURIComponent(code)}&from=sales`);
  });

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
  const showStaffCol = filter !== 'products';

  const todayMs = useMemo(() => Date.parse(`${todayISO}T00:00:00Z`), [todayISO]);
  const sevenDaysAgoISO = useMemo(
    () => clampSalesDateRange(new Date(todayMs - 6 * 86_400_000).toISOString().slice(0, 10), todayISO, todayISO).fromISO,
    [todayMs, todayISO],
  );
  const thirtyDaysAgoISO = useMemo(
    () => clampSalesDateRange(new Date(todayMs - 29 * 86_400_000).toISOString().slice(0, 10), todayISO, todayISO).fromISO,
    [todayMs, todayISO],
  );
  const monthStartISO = useMemo(
    () => clampSalesDateRange(`${todayISO.slice(0, 7)}-01`, todayISO, todayISO).fromISO,
    [todayISO],
  );

  const activeRangePreset: 'today' | 'last_7_days' | 'last_30_days' | 'this_month' | 'custom' = useMemo(() => {
    if (toDate === todayISO) {
      if (fromDate === todayISO) return 'today';
      if (fromDate === sevenDaysAgoISO) return 'last_7_days';
      if (fromDate === thirtyDaysAgoISO) return 'last_30_days';
      if (fromDate === monthStartISO) return 'this_month';
    }
    return 'custom';
  }, [fromDate, toDate, todayISO, sevenDaysAgoISO, thirtyDaysAgoISO, monthStartISO]);

  const applyDates = (rawFrom: string, rawTo: string, changed?: 'from' | 'to') => {
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoRe.test(rawFrom) || !isoRe.test(rawTo)) return;
    const nextFrom = changed === 'to' && rawTo < rawFrom ? rawTo : rawFrom;
    const nextTo = changed === 'from' && rawFrom > rawTo ? rawFrom : rawTo;
    const { fromISO: safeFrom, toISO: safeTo } = clampSalesDateRange(nextFrom, nextTo, todayISO);
    setFromDate(safeFrom);
    setToDate(safeTo);
    setPage(1);
    const seq = ++fetchSeqRef.current;
    api
      .appointments(safeFrom, safeTo, undefined, undefined, { includeSales: true })
      .then((rows) => {
        if (fetchSeqRef.current !== seq) return;
        setLoadedAppointments((prev) => {
          const map = new Map(prev.map((a) => [a.id, a]));
          for (const a of rows) map.set(a.id, a);
          return [...map.values()];
        });
      })
      .catch(() => {});
    const params = new URLSearchParams();
    params.set('date', safeFrom);
    params.set('to', safeTo);
    if (filter !== 'all') params.set('filter', filter);
    router.replace(`/sales?${params.toString()}`, { scroll: false });
  };

  const allSaleRows = useMemo(() => buildSaleRows(loadedAppointments, timezone), [loadedAppointments, timezone]);

  const effectiveBranches = branch.pinned ? branch.choice : selectedBranches;

  const windowRows = useMemo(
    () => filterSalesByDateRange(allSaleRows, fromDate, toDate, effectiveBranches),
    [allSaleRows, fromDate, toDate, effectiveBranches],
  );

  const selectedDayCount = useMemo(() => {
    const s = Date.parse(`${fromDate}T00:00:00Z`);
    const e = Date.parse(`${toDate}T00:00:00Z`);
    return Number.isFinite(s) && Number.isFinite(e) ? Math.max(1, Math.round((e - s) / 86_400_000) + 1) : 1;
  }, [fromDate, toDate]);

  const prevWindowRows = useMemo(() => {
    const s = Date.parse(`${fromDate}T00:00:00Z`);
    if (!Number.isFinite(s)) return [];
    const prevFromISO = new Date(s - selectedDayCount * 86_400_000).toISOString().slice(0, 10);
    const prevToISO = new Date(s - 86_400_000).toISOString().slice(0, 10);
    return filterSalesByDateRange(allSaleRows, prevFromISO, prevToISO, effectiveBranches);
  }, [allSaleRows, fromDate, selectedDayCount, effectiveBranches]);

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

  const toolbarRows = useMemo(
    () =>
      filterSalesRows(windowRows, 'all', search, {
        selectedClients,
        selectedServices,
        selectedProducts,
        clientQuery,
        serviceQuery,
        productQuery,
      }),
    [windowRows, search, selectedClients, selectedServices, selectedProducts, clientQuery, serviceQuery, productQuery],
  );

  const prevToolbarRows = useMemo(
    () =>
      filterSalesRows(prevWindowRows, 'all', search, {
        selectedClients,
        selectedServices,
        selectedProducts,
        clientQuery,
        serviceQuery,
        productQuery,
      }),
    [prevWindowRows, search, selectedClients, selectedServices, selectedProducts, clientQuery, serviceQuery, productQuery],
  );

  const counts = useMemo(
    () => ({
      all: windowRows.length,
      products: windowRows.reduce((sum, r) => sum + r.productUnits, 0),
      services: windowRows.reduce((sum, r) => sum + r.serviceNames.length, 0),
    }),
    [windowRows],
  );

  const kpis = useMemo(() => computeSalesKpis(toolbarRows), [toolbarRows]);
  const prevKpis = useMemo(() => computeSalesKpis(prevToolbarRows), [prevToolbarRows]);
  const quickStats = useMemo(
    () => computeSalesQuickStats(toolbarRows, prevToolbarRows),
    [toolbarRows, prevToolbarRows],
  );

  const totalSalesDelta = useMemo(
    () => computeDeltaPct(kpis.totalSalesMinor, prevKpis.totalSalesMinor),
    [kpis.totalSalesMinor, prevKpis.totalSalesMinor],
  );
  const servicesDelta = useMemo(
    () => computeDeltaPct(kpis.servicesRevenueMinor, prevKpis.servicesRevenueMinor),
    [kpis.servicesRevenueMinor, prevKpis.servicesRevenueMinor],
  );
  const productsDelta = useMemo(
    () => computeDeltaPct(kpis.productsRevenueMinor, prevKpis.productsRevenueMinor),
    [kpis.productsRevenueMinor, prevKpis.productsRevenueMinor],
  );

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

  const paymentDonut = useMemo(() => {
    const total =
      kpis.byMode.upi + kpis.byMode.cash + kpis.byMode.card + kpis.byMode.other + kpis.byMode.notRecorded;
    const modes: { key: 'upi' | 'cash' | 'card'; label: string; amountMinor: number; pct: number; cls: string }[] = [
      {
        key: 'upi',
        label: tc('pay.upi'),
        amountMinor: kpis.byMode.upi,
        pct: total > 0 ? Math.round((kpis.byMode.upi / total) * 100) : 0,
        cls: 'is-upi',
      },
      {
        key: 'cash',
        label: tc('pay.cash'),
        amountMinor: kpis.byMode.cash,
        pct: total > 0 ? Math.round((kpis.byMode.cash / total) * 100) : 0,
        cls: 'is-cash',
      },
      {
        key: 'card',
        label: tc('pay.card'),
        amountMinor: kpis.byMode.card,
        pct: total > 0 ? Math.round((kpis.byMode.card / total) * 100) : 0,
        cls: 'is-card',
      },
    ];
    let offset = 0;
    const segments = modes.map((m) => {
      const seg = { ...m, dashOffset: 100 - offset };
      offset += m.pct;
      return seg;
    });
    return { total, segments };
  }, [kpis.byMode, tc]);

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

  const hasActiveFilters =
    (!branch.pinned && (selectedBranches.length > 0 || branchQuery.trim() !== '')) ||
    selectedClients.length > 0 ||
    selectedServices.length > 0 ||
    selectedProducts.length > 0 ||
    clientQuery.trim() !== '' ||
    serviceQuery.trim() !== '' ||
    productQuery.trim() !== '' ||
    search.trim() !== '' ||
    filter !== 'all' ||
    fromDate !== sevenDaysAgoISO ||
    toDate !== todayISO;

  const clearAllFilters = () => {
    setSelectedBranches([]);
    setBranchQuery('');
    setSelectedClients([]);
    setClientQuery('');
    setSelectedServices([]);
    setServiceQuery('');
    setSelectedProducts([]);
    setProductQuery('');
    setSearch('');
    setFilter('all');
    setOpenDropdown(null);
    setPage(1);
    if (fromDate !== sevenDaysAgoISO || toDate !== todayISO) {
      setFromDate(sevenDaysAgoISO);
      setToDate(todayISO);
      const seq = ++fetchSeqRef.current;
      api
        .appointments(sevenDaysAgoISO, todayISO, undefined, undefined, { includeSales: true })
        .then((rows) => {
          if (fetchSeqRef.current !== seq) return;
          setLoadedAppointments((prev) => {
            const map = new Map(prev.map((a) => [a.id, a]));
            for (const a of rows) map.set(a.id, a);
            return [...map.values()];
          });
        })
        .catch(() => {});
    }
    const params = new URLSearchParams();
    params.set('date', sevenDaysAgoISO);
    params.set('to', todayISO);
    router.replace(`/sales?${params.toString()}`, { scroll: false });
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

  const branchScopedRows = useMemo(
    () => filterSalesByDateRange(allSaleRows, minDateISO, todayISO, effectiveBranches),
    [allSaleRows, minDateISO, todayISO, effectiveBranches],
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        menu
        actions={
          mayRecordPayment ? (
            <div className="sls-header-actions">
              <button
                type="button"
                className="btn btn-ghost sls-top-return-btn"
                onClick={() => setReturnSheet({ open: true, bill: null, scannedCode: '' })}
              >
                <IconReturn />
                <span>{t('returnProduct')}</span>
              </button>
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
            </div>
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
                ref={fromInputRef}
                type="date"
                className="sls-date-input"
                aria-label={t('from')}
                value={fromDate}
                min={minDateISO}
                max={todayISO}
                onChange={(e) => applyDates(e.target.value, toDate, 'from')}
              />
            </label>
            <label className="sls-date-field">
              <span className="sls-date-label">{t('to')}</span>
              <input
                type="date"
                className="sls-date-input"
                aria-label={t('to')}
                value={toDate}
                min={minDateISO}
                max={todayISO}
                onChange={(e) => applyDates(fromDate, e.target.value, 'to')}
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

            <button
              type="button"
              className={`sls-clear-filters-btn ${hasActiveFilters ? 'is-active' : ''}`}
              onClick={clearAllFilters}
            >
              <IconClose />
              <span>{t('clearAllFilters')}</span>
            </button>
          </div>
        </div>

        {/* 4 Pastel-Tinted Summary KPI Cards */}
        <div className="sls-kpis">
          <button
            type="button"
            className={`sls-kpi sls-kpi-tap sls-kpi-green ${filter === 'all' ? 'is-selected' : ''}`}
            aria-pressed={filter === 'all'}
            onClick={() => {
              setFilter('all');
              setPage(1);
            }}
          >
            <div className="sls-kpi-body">
              <div className="sls-kpi-copy">
                <div className="sls-kpi-head">
                  <span className="sls-kpi-icon sls-icon-green">
                    <IconRupee />
                  </span>
                  <span className="sls-kpi-label">{t('kpi.totalSales')}</span>
                </div>
                <strong className="sls-kpi-value">{formatMoney(String(kpis.totalSalesMinor))}</strong>
                <div className="sls-kpi-foot">
                  {totalSalesDelta !== null ? (
                    <span className={`sls-kpi-delta ${totalSalesDelta < 0 ? 'is-down' : 'is-up'}`}>
                      <b>{totalSalesDelta >= 0 ? '↑' : '↓'}</b>{' '}
                      {t('kpi.vsPrevDays', { pct: Math.abs(totalSalesDelta), n: selectedDayCount })}
                    </span>
                  ) : (
                    <span className="sls-kpi-sub">{t('kpi.billsCount', { n: kpis.billsCount })}</span>
                  )}
                </div>
              </div>
              <span className="sls-kpi-spark sls-spark-green" aria-hidden="true">
                <i style={{ height: '34%' }} />
                <i style={{ height: '52%' }} />
                <i style={{ height: '72%' }} />
                <i style={{ height: '96%' }} />
              </span>
            </div>
          </button>

          <button
            type="button"
            className={`sls-kpi sls-kpi-tap sls-kpi-blue ${filter === 'services' ? 'is-selected' : ''}`}
            aria-pressed={filter === 'services'}
            onClick={() => {
              setFilter(filter === 'services' ? 'all' : 'services');
              setPage(1);
            }}
          >
            <div className="sls-kpi-body">
              <div className="sls-kpi-copy">
                <div className="sls-kpi-head">
                  <span className="sls-kpi-icon sls-icon-blue">
                    <IconServices />
                  </span>
                  <span className="sls-kpi-label">{t('kpi.servicesSold')}</span>
                </div>
                <strong className="sls-kpi-value">{formatMoney(String(kpis.servicesRevenueMinor))}</strong>
                <div className="sls-kpi-foot">
                  {servicesDelta !== null ? (
                    <span className={`sls-kpi-delta ${servicesDelta < 0 ? 'is-down' : 'is-up'}`}>
                      <b>{servicesDelta >= 0 ? '↑' : '↓'}</b>{' '}
                      {t('kpi.vsPrevDays', { pct: Math.abs(servicesDelta), n: selectedDayCount })}
                    </span>
                  ) : (
                    <span className="sls-kpi-sub">{t('kpi.servicesCount', { n: kpis.servicesCount })}</span>
                  )}
                </div>
              </div>
              <span className="sls-kpi-spark sls-spark-blue" aria-hidden="true">
                <i style={{ height: '30%' }} />
                <i style={{ height: '48%' }} />
                <i style={{ height: '68%' }} />
                <i style={{ height: '94%' }} />
              </span>
            </div>
          </button>

          <button
            type="button"
            className={`sls-kpi sls-kpi-tap sls-kpi-amber ${filter === 'products' ? 'is-selected' : ''}`}
            aria-pressed={filter === 'products'}
            onClick={() => {
              setFilter(filter === 'products' ? 'all' : 'products');
              setPage(1);
            }}
          >
            <div className="sls-kpi-body">
              <div className="sls-kpi-copy">
                <div className="sls-kpi-head">
                  <span className="sls-kpi-icon sls-icon-amber">
                    <IconProducts />
                  </span>
                  <span className="sls-kpi-label">{t('kpi.productsSold')}</span>
                </div>
                <strong className="sls-kpi-value">{formatMoney(String(kpis.productsRevenueMinor))}</strong>
                <div className="sls-kpi-foot">
                  {productsDelta !== null ? (
                    <span className={`sls-kpi-delta ${productsDelta < 0 ? 'is-down' : 'is-up'}`}>
                      <b>{productsDelta >= 0 ? '↑' : '↓'}</b>{' '}
                      {t('kpi.vsPrevDays', { pct: Math.abs(productsDelta), n: selectedDayCount })}
                    </span>
                  ) : (
                    <span className="sls-kpi-sub">{t('kpi.unitsCount', { n: kpis.productUnitsCount })}</span>
                  )}
                </div>
              </div>
              <span className="sls-kpi-spark sls-spark-amber" aria-hidden="true">
                <i style={{ height: '28%' }} />
                <i style={{ height: '46%' }} />
                <i style={{ height: '66%' }} />
                <i style={{ height: '92%' }} />
              </span>
            </div>
          </button>

          <div className="sls-kpi sls-kpi-purple">
            <div className="sls-kpi-head">
              <span className="sls-kpi-icon sls-icon-purple">
                <IconReceipt />
              </span>
              <span className="sls-kpi-label">{t('kpi.paymentSplit')}</span>
            </div>
            <div className="sls-pay-donut-row">
              <svg className="sls-pay-donut" viewBox="0 0 42 42" aria-hidden="true">
                <circle className="sls-donut-track" cx="21" cy="21" r="15.9155" />
                {paymentDonut.total > 0
                  ? paymentDonut.segments.map((seg) =>
                      seg.pct > 0 ? (
                        <circle
                          key={seg.key}
                          className={`sls-donut-seg ${seg.cls}`}
                          cx="21"
                          cy="21"
                          r="15.9155"
                          strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
                          strokeDashoffset={seg.dashOffset}
                        />
                      ) : null,
                    )
                  : null}
              </svg>
              <div className="sls-pay-modes">
                {paymentDonut.segments.map((seg) => (
                  <div key={seg.key} className="sls-pay-line">
                    <span className={`sls-pay-dot ${seg.cls}`} aria-hidden="true" />
                    <span className="sls-pay-name">{seg.label}</span>
                    <strong>{formatMoney(String(seg.amountMinor))}</strong>
                    <span className="sls-pay-pct">{seg.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Middle Split: Sales Trend Chart + Quick Stats */}
        <div className="sls-mid-grid">
          <section className="sls-chart-card" aria-label={t('chart.title')}>
            <div className="sls-chart-head">
              <div className="sls-chart-title-wrap">
                <h2 className="sls-chart-title">{t('chart.title')}</h2>
                <div className="sls-chart-presets" role="group" aria-label={t('chart.title')}>
                  <button
                    type="button"
                    className={`sls-preset-pill ${activeRangePreset === 'today' ? 'is-on' : ''}`}
                    aria-pressed={activeRangePreset === 'today'}
                    onClick={() => applyDates(todayISO, todayISO)}
                  >
                    {t('ranges.today')}
                  </button>
                  <button
                    type="button"
                    className={`sls-preset-pill ${activeRangePreset === 'last_7_days' ? 'is-on' : ''}`}
                    aria-pressed={activeRangePreset === 'last_7_days'}
                    onClick={() => applyDates(sevenDaysAgoISO, todayISO)}
                  >
                    {t('ranges.last_7_days')}
                  </button>
                  <button
                    type="button"
                    className={`sls-preset-pill ${activeRangePreset === 'last_30_days' ? 'is-on' : ''}`}
                    aria-pressed={activeRangePreset === 'last_30_days'}
                    onClick={() => applyDates(thirtyDaysAgoISO, todayISO)}
                  >
                    {t('ranges.last_30_days')}
                  </button>
                  <button
                    type="button"
                    className={`sls-preset-pill ${activeRangePreset === 'this_month' ? 'is-on' : ''}`}
                    aria-pressed={activeRangePreset === 'this_month'}
                    onClick={() => applyDates(monthStartISO, todayISO)}
                  >
                    {t('ranges.this_month')}
                  </button>
                  <button
                    type="button"
                    className={`sls-preset-pill ${activeRangePreset === 'custom' ? 'is-on' : ''}`}
                    aria-pressed={activeRangePreset === 'custom'}
                    onClick={() => fromInputRef.current?.focus()}
                  >
                    {t('ranges.custom')}
                  </button>
                </div>
                <span className="sls-chart-mode">
                  {chartData.rangeLabel} · {t(`chart.${chartData.mode}`)}
                </span>
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
                <div className="sls-chart-plot">
                  <div className="sls-chart-yaxis" aria-hidden="true">
                    {chartData.yTicks.map((tick) => (
                      <span key={tick.valueMinor}>{tick.label}</span>
                    ))}
                  </div>
                  <div className="sls-chart-stage">
                    <div className="sls-chart-gridlines" aria-hidden="true">
                      {chartData.yTicks.map((tick) => (
                        <span key={tick.valueMinor} className="sls-chart-gridline" />
                      ))}
                    </div>
                    <div
                      className={`sls-chart-bars ${chartData.buckets.length > 10 ? 'is-dense' : ''}`}
                      role="list"
                      aria-label={t('chart.title')}
                    >
                      {chartData.buckets.map((b, idx) => {
                        const n = chartData.buckets.length;
                        const tickStep = Math.max(1, Math.ceil(n / 6));
                        const showTick =
                          n <= 10 ||
                          idx === n - 1 ||
                          (idx % tickStep === 0 && n - 1 - idx >= Math.ceil(tickStep / 2));
                        const pct =
                          b.totalMinor > 0
                            ? Math.max(6, Math.min(96, Math.round((b.totalMinor / chartData.yMaxMinor) * 100)))
                            : 2;
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
                              ) : b.totalMinor > 0 ? (
                                <span
                                  className={`sls-chart-val ${n <= 10 ? 'is-always' : ''}`}
                                  style={{ bottom: `calc(${pct}% + 4px)` }}
                                >
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
                            <span
                              className={`sls-chart-lbl ${showTick ? '' : 'is-tick-hidden'}`}
                              aria-hidden={!showTick || undefined}
                            >
                              {b.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )
            ) : null}
          </section>

          <aside className="sls-quick-card" aria-label={t('quickStats.title')}>
            <div className="sls-quick-head">
              <h2 className="sls-quick-title">{t('quickStats.title')}</h2>
              <a href="/reports" className="sls-quick-link">
                <span>{t('quickStats.viewAll')}</span>
                <IconChevronRight />
              </a>
            </div>
            <div className="sls-quick-list">
              <div className="sls-quick-row">
                <span className="sls-quick-icon">
                  <IconAnalytics />
                </span>
                <span className="sls-quick-label">{t('quickStats.avgBill')}</span>
                <div className="sls-quick-right">
                  <strong className="sls-quick-val">{formatMoney(String(quickStats.avgBillMinor))}</strong>
                  {quickStats.avgBillDeltaPct !== null ? (
                    <span className={`sls-quick-pill ${quickStats.avgBillDeltaPct < 0 ? 'is-down' : 'is-up'}`}>
                      {quickStats.avgBillDeltaPct >= 0 ? '↑' : '↓'} {Math.abs(quickStats.avgBillDeltaPct)}%
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="sls-quick-row">
                <span className="sls-quick-icon">
                  <IconUserPlus />
                </span>
                <span className="sls-quick-label">{t('quickStats.clientsServed')}</span>
                <div className="sls-quick-right">
                  <strong className="sls-quick-val">{quickStats.clientsCount}</strong>
                  {quickStats.clientsDeltaPct !== null ? (
                    <span className={`sls-quick-pill ${quickStats.clientsDeltaPct < 0 ? 'is-down' : 'is-up'}`}>
                      {quickStats.clientsDeltaPct >= 0 ? '↑' : '↓'} {Math.abs(quickStats.clientsDeltaPct)}%
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="sls-quick-row">
                <span className="sls-quick-icon">
                  <IconServices />
                </span>
                <span className="sls-quick-label">{t('quickStats.topService')}</span>
                <div className="sls-quick-stack">
                  <strong className="sls-quick-name">
                    {quickStats.topService ? quickStats.topService.name : t('quickStats.noneYet')}
                  </strong>
                  {quickStats.topService ? (
                    <span className="sls-quick-sub">
                      {t('quickStats.bookingsCount', { n: quickStats.topService.count })}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="sls-quick-row">
                <span className="sls-quick-icon">
                  <IconProducts />
                </span>
                <span className="sls-quick-label">{t('quickStats.topProduct')}</span>
                <div className="sls-quick-stack">
                  <strong className="sls-quick-name">
                    {quickStats.topProduct ? quickStats.topProduct.name : t('quickStats.noneYet')}
                  </strong>
                  {quickStats.topProduct ? (
                    <span className="sls-quick-sub">
                      {t('kpi.unitsCount', { n: quickStats.topProduct.units })}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Filter Tabs + Search + Export CSV */}
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

          <div className="sls-table-actions">
            <label className="search-wrap sls-table-search">
              <IconSearch />
              <input
                type="search"
                className="search-input search-input-bare"
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>

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
                    {showServicesCol ? (
                      <th>
                        {t('cols.services')} <span className="sls-th-sub">{t('cols.countSuffix')}</span>
                      </th>
                    ) : null}
                    {showProductsCol ? (
                      <th>
                        {t('cols.products')} <span className="sls-th-sub">{t('cols.countSuffix')}</span>
                      </th>
                    ) : null}
                    {showStaffCol ? <th>{providerWord}</th> : null}
                    <th>{t('cols.payment')}</th>
                    <th className="is-num">{t('cols.total')}</th>
                    <th>{t('cols.status')}</th>
                    <th className="is-action">{t('cols.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const shownProducts = row.products.slice(0, MAX_ROW_PRODUCTS);
                    const hiddenProducts = row.products.length - shownProducts.length;
                    const primaryMode = row.paymentModes[0] ?? 'other';
                    const canReturnRow =
                      mayRecordPayment &&
                      row.productUnits > 0 &&
                      computeReturnWindow(row.dayISO, todayISO, returnWindowDays).eligible;
                    const fullyReturned = row.returnedUnits > 0 && row.productUnits === 0 && row.serviceNames.length === 0;
                    const partReturned = row.returnedUnits > 0 && !fullyReturned;
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
                                  <span
                                    key={`${p.productId ?? p.name}-${i}`}
                                    className={`sls-badge sls-badge-prd ${lineRemainingQty(p) === 0 ? 'is-returned' : ''}`}
                                  >
                                    <IconProducts />
                                    {p.qty > 1 ? `${p.name} (${p.qty})` : `${p.name} (1)`}
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
                            {row.staffNames.length > 0 ? (
                              <div className="sls-staff-cell">
                                <span className="sls-staff-avatar">{initials(row.staffNames[0]!)}</span>
                                <span>{row.staffNames.join(', ')}</span>
                              </div>
                            ) : (
                              <span className="sls-muted">{t('noStaff')}</span>
                            )}
                          </td>
                        ) : null}
                        <td>
                          <span className={`sls-pay-pill is-${primaryMode}`}>
                            <span className="sls-pay-pill-dot" aria-hidden="true" />
                            {formatPaymentMode(row.paymentModes)}
                          </span>
                        </td>
                        <td className="is-num sls-col-total">{formatMoney(String(rowAmountMinor(row)))}</td>
                        <td>
                          {fullyReturned ? (
                            <span className="sls-status-pill is-returned">
                              <IconReturn />
                              <span>{t('returnedStatus')}</span>
                            </span>
                          ) : partReturned ? (
                            <span className="sls-status-pill is-part-returned">
                              <IconReturn />
                              <span>{t('partReturnedStatus')}</span>
                            </span>
                          ) : (
                            <span className="sls-status-pill">
                              <IconCheck />
                              <span>{t('completedStatus')}</span>
                            </span>
                          )}
                        </td>
                        <td className="is-action">
                          <div className="sls-row-actions">
                            {canReturnRow ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm sls-return-btn"
                                onClick={() => setReturnSheet({ open: true, bill: row, scannedCode: '' })}
                              >
                                <IconReturn />
                                <span>{t('returnBtn')}</span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm sls-view-btn"
                              onClick={() => setOpenBooking(row.group)}
                            >
                              {t('view')}
                            </button>
                          </div>
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
                const canReturnRow =
                  mayRecordPayment &&
                  row.productUnits > 0 &&
                  computeReturnWindow(row.dayISO, todayISO, returnWindowDays).eligible;
                return (
                  <div key={row.key} className="sls-card-wrap">
                    <button
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
                              <span
                                key={`${p.productId ?? p.name}-${i}`}
                                className={`sls-badge sls-badge-prd ${lineRemainingQty(p) === 0 ? 'is-returned' : ''}`}
                              >
                                <IconProducts />
                                {p.qty > 1 ? `${p.name} (${p.qty})` : `${p.name} (1)`}
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
                    {canReturnRow ? (
                      <div className="sls-card-foot">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm sls-return-btn"
                          onClick={() => setReturnSheet({ open: true, bill: row, scannedCode: '' })}
                        >
                          <IconReturn />
                          <span>{t('returnBtn')}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
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
          onReturnProducts={(() => {
            const openRow = allSaleRows.find((r) => r.key === openBooking.key);
            if (
              !openRow ||
              !mayRecordPayment ||
              openRow.productUnits <= 0 ||
              !computeReturnWindow(openRow.dayISO, todayISO, returnWindowDays).eligible
            ) {
              return undefined;
            }
            return () => {
              setOpenBooking(null);
              setReturnSheet({ open: true, bill: openRow, scannedCode: '' });
            };
          })()}
          onClose={() => {
            setOpenBooking(null);
            router.refresh();
          }}
        />
      ) : null}

      {returnSheet.open ? (
        <ReturnProductSheet
          bills={branchScopedRows}
          initialBill={returnSheet.bill}
          initialScannedCode={returnSheet.scannedCode}
          timezone={timezone}
          todayISO={todayISO}
          returnWindowDays={returnWindowDays}
          onClose={() => setReturnSheet({ open: false, bill: null, scannedCode: '' })}
          onReturned={(res) => {
            // A replay answers a request already made: its units are in the list the refresh brings, not new ones.
            setLoadedAppointments((prev) =>
              prev.map((a) => {
                const visitKey = a.bookingGroupId ?? a.id;
                if (visitKey === res.visitKey && a.products && !res.replayed) {
                  return {
                    ...a,
                    refunds: [...(a.refunds ?? []), { mode: res.refundMode, amountMinor: String(res.refundMinor) }],
                    products: a.products.map((p) => {
                      const ret = res.items.find((it) => it.productId === lineReturnId(p));
                      if (!ret) return p;
                      return {
                        ...p,
                        returnedQty: Number(p.returnedQty || 0) + ret.qty,
                        returnedMinor: String(Number(p.returnedMinor || 0) + ret.refundMinor),
                      };
                    }),
                  };
                }
                return a;
              }),
            );
            setReturnSheet({ open: false, bill: null, scannedCode: '' });
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
