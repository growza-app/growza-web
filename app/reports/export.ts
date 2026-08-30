import { copy } from '../lib/copy';
import type { TabPayload } from './ReportsClient';

/**
 * A tab's figures as CSV (GRW-60).
 *
 * Built from the same payload object the tab renders, never from a second
 * query. That is what makes "the export equals the screen" structural rather
 * than a thing to re-verify by hand every time a tab changes: there is only
 * one set of numbers, and both the chart and the file read it.
 *
 * Money is written in major units with no symbol and no grouping, because a
 * spreadsheet has to be able to add the column up — `₹24,92,693` is a string
 * to Excel. The screen keeps its formatting; the file is for arithmetic.
 */

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rows(lines: (string | number | null | undefined)[][]): string {
  return lines.map((line) => line.map(esc).join(',')).join('\n');
}

const money = (minor: number) => (minor / 100).toFixed(2);
const pct = (value: number | null) => (value === null ? '' : String(value));

/** A section heading, a blank line before it, so one file can hold several tables. */
function section(title: string, header: string[], body: (string | number | null | undefined)[][]) {
  return body.length === 0 ? '' : `\n${esc(title)}\n${rows([header, ...body])}\n`;
}

export function reportToCsv(payload: TabPayload, providerLabel: string): string {
  if (!payload) return '';

  if (payload.tab === 'revenue') {
    const d = payload.data;
    return [
      section('Totals', ['Figure', 'Amount'], [
        ['Money earned', money(d.kpis.totalRevenueMinor.value)],
        ['From finished visits', money(d.kpis.completedRevenueMinor.value)],
        ['Average booking', money(d.kpis.avgBookingValueMinor.value)],
        ['Per client', money(d.kpis.revenuePerCustomerMinor.value)],
      ]),
      section('Over time', ['Date', 'Amount'], d.trend.map((p) => [p.label, money(p.value)])),
      section('By service', ['Service', 'Amount'], d.byService.map((r) => [r.label, money(r.value)])),
      d.showProviders
        ? section(`By ${providerLabel.toLowerCase()}`, [providerLabel, 'Amount'], d.byProvider.map((r) => [r.label, money(r.value)]))
        : '',
      section('By client type', ['Type', 'Amount'], d.bySegment.map((r) => [r.label, money(r.value)])),
      section('By payment', ['Method', 'Amount'], d.byPaymentMethod.map((r) => [r.label, money(r.value)])),
    ].join('');
  }

  if (payload.tab === 'bookings') {
    const d = payload.data;
    return [
      section('Totals', ['Figure', 'Count'], [
        ['Bookings', d.kpis.total.value],
        ['Finished', d.kpis.completed.value],
        ['Called off', d.kpis.cancelled.value],
        [copy.status.didNotCome, d.kpis.noShow.value],
        ['Still to come', d.kpis.upcoming.value],
      ]),
      section('Over time', ['Date', 'Bookings'], d.trend.map((p) => [p.label, p.value])),
      section('What happened', ['Outcome', 'Bookings'], d.byStatus.map((r) => [r.label, r.value])),
      section('Where they came from', ['Source', 'Bookings'], d.bySource.map((r) => [r.label, r.value])),
    ].join('');
  }

  if (payload.tab === 'services') {
    const d = payload.data;
    return section(
      'Services',
      ['Service', 'Bookings', 'Money', 'Average price', 'Minutes', 'Booked again %', 'Called off %', 'Still offered'],
      d.rows.map((r) => [
        r.name,
        r.bookings,
        money(r.revenueMinor),
        r.avgPriceMinor === null ? '' : money(r.avgPriceMinor),
        r.durationMin,
        pct(r.repeatPct),
        pct(r.cancelPct),
        r.retired ? 'no' : 'yes',
      ]),
    );
  }

  if (payload.tab === 'staff') {
    const d = payload.data;
    return section(
      providerLabel,
      [providerLabel, 'Bookings', 'Finished', copy.status.didNotCome, 'Money', 'Average', 'Busy %', 'Still working'],
      d.rows.map((r) => [
        r.name,
        r.bookings,
        r.completed,
        pct(r.noShowPct),
        money(r.revenueMinor),
        r.avgValueMinor === null ? '' : money(r.avgValueMinor),
        // Blank, not zero, when a service or outcome filter is on: the hours
        // someone was available cannot be narrowed the same way, so there is
        // no honest figure to write (see StaffReport.utilisationSuppressed).
        pct(r.utilisationPct),
        r.retired ? 'no' : 'yes',
      ]),
    );
  }

  if (payload.tab === 'customers') {
    const d = payload.data;
    return [
      section(
        'How your clients are doing',
        ['Group', 'When they last came', 'Clients'],
        d.segments.map((s) => [
          copy.clients.segments[s.key].label,
          copy.clients.segments[s.key].range,
          s.count,
        ]),
      ),
      section(
        'Top clients',
        ['Client', 'Visits', 'Total spent', 'Average', 'Last visit (days ago)'],
        d.topCustomers.map((r) => [
          r.name,
          r.visits,
          money(r.lifetimeSpendMinor),
          money(r.avgSpendMinor),
          r.lastVisitDays,
        ]),
      ),
    ].join('');
  }

  const d = payload.data;
  return [
    section('Totals', ['Figure', 'Value'], [
      ['Money earned', money(d.kpis.revenueMinor.value)],
      ['Bookings', d.kpis.bookings.value],
      ['New clients', d.kpis.newCustomers.value],
      ['Came back %', d.kpis.repeatRatePct.value],
    ]),
    section('Money over time', ['Date', 'Amount'], d.revenueTrend.map((p) => [p.label, money(p.value)])),
    section('Bookings over time', ['Date', 'Bookings'], d.bookingTrend.map((p) => [p.label, p.value])),
  ].join('');
}

/** `growza-money-this-month.csv` — tenant, tab and range, as FR-05 states. */
export function csvFilename(tenantName: string, tabLabel: string, rangeLabel: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'report';
  return `${slug(tenantName)}-${slug(tabLabel)}-${slug(rangeLabel)}.csv`;
}

/** Hands the file to the browser. No server round trip — the data is already here. */
export function downloadCsv(filename: string, body: string): void {
  // The BOM is what makes Excel open a UTF-8 CSV as UTF-8; without it a
  // customer named "Zoë" arrives mangled.
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
