import { copy } from '../lib/copy';
import { csvCell, csvLines } from '../lib/csv';
import { nounInSentence } from '../lib/nouns';
import type { TabPayload } from './ReportsClient';

/**
 * A tab's figures as CSV (GRW-60).
 *
 * Built from the same payload object the tab renders, never from a second
 * query — that is what makes "the file equals the screen" structural rather
 * than something to re-verify every time a tab changes.
 *
 * **Every heading comes from `copy`, the same strings the tabs render, and the
 * rows are the same figures in the same order.** The first version wrote its
 * own words and chose its own figures, and every tab drifted:
 *
 *   - Revenue had a row headed "Money earned" carrying the *uncompleted*
 *     total, 25,93,443, while the tile headed "Money earned" showed
 *     24,92,693. One label, two numbers — the exact defect this epic spent
 *     itself fixing, reintroduced in the export of the screen that fixed it.
 *   - Bookings had a "Finished" row the tab deliberately dropped, and said
 *     "Called off" where the app says "Cancelled".
 *   - Services and Staff each renamed three columns and reordered them.
 *
 * So there is no literal column heading in this file. If a column needs a
 * name it is because a tab has one, and the tab's name is the name
 * (conventions §3).
 *
 * Money is written in major units with no symbol and no grouping, because a
 * spreadsheet has to be able to add the column up — `₹24,92,693` is a string
 * to Excel. The screen keeps its formatting; the file is for arithmetic.
 */

// Jira GRW-476 — the shared writer, which also defuses a cell a spreadsheet would run as a formula.
function rows(lines: (string | number | null | undefined)[][]): string {
  return csvLines(lines);
}

const money = (minor: number) => (minor / 100).toFixed(2);
const pct = (value: number | null) => (value === null ? '' : String(value));

/** A section heading, a blank line before it, so one file can hold several tables. */
function section(title: string, header: string[], body: (string | number | null | undefined)[][]) {
  return body.length === 0 ? '' : `\n${csvCell(title)}\n${rows([header, ...body])}\n`;
}

const c = copy.reports;

/**
 * The two columns a row of tiles becomes.
 *
 * The only headings in this file that no tab owns, because no tab renders its
 * KPI row as a table. Everything under them is the tiles' own words.
 */
const TILE_COLUMNS = ['Figure', 'Value'];
const DATE = 'Date';

/**
 * The bands are cards on screen, not a table, so like the tile rows they need
 * column names no tab owns. The values under them are still the bands' own
 * words, straight from `copy.clients.segments`.
 */
const BAND_COLUMNS = ['Group', 'When they last came', 'Clients'];

/** The same four words the chart slices and the Bookings chips use (conventions §3). */
function statusWord(key: string): string {
  return key === 'completed'
    ? copy.status.done
    : key === 'cancelled'
      ? copy.status.cancelled
      : key === 'no_show'
        ? copy.status.didNotCome
        : copy.status.confirmed;
}

/**
 * Jira GRW-363 — the no-stylist row gets the name the screen gives it ("No stylist", "No doctor"),
 * not the API's "Unassigned", so the owner never sees two names for one row. Every other row is
 * written as the API sent it: the English the screen shows, or what the owner typed.
 */
function rowName(row: { key?: string; label: string }, providerNoun: string): string {
  return row.key === 'unassigned' ? c.noProvider(nounInSentence(providerNoun)) : row.label;
}

/**
 * @param providerLabel the vertical's plural noun, a column heading ("Staff", "Doctors").
 * @param providerNoun  its singular, for the no-stylist row ("Stylist" → "No stylist").
 */
export function reportToCsv(payload: TabPayload, providerLabel: string, providerNoun = 'Staff member'): string {
  if (!payload) return '';

  if (payload.tab === 'revenue') {
    const d = payload.data;
    const t = c.money;
    return [
      // The same three tiles the tab shows, in the same order, carrying the
      // same figures. `totalRevenueMinor` is deliberately absent: no tile
      // shows it, so a row for it would be a number in the file that cannot
      // be checked against the screen.
      section(t.earned, TILE_COLUMNS, [
        [t.earned, money(d.kpis.completedRevenueMinor.value)],
        [t.perVisit, money(d.kpis.avgBookingValueMinor.value)],
        [t.perClient, money(d.kpis.revenuePerCustomerMinor.value)],
      ]),
      section(t.trend, [DATE, t.earned], d.trend.map((p) => [p.label, money(p.value)])),
      section(t.byService, [c.servicesTab.colService, t.earned], d.byService.map((r) => [r.label, money(r.value)])),
      d.showProviders
        ? section(t.byStaff, [providerLabel, t.earned], d.byProvider.map((r) => [rowName(r, providerNoun), money(r.value)]))
        : '',
      section(t.bySegment, [t.bySegment, t.earned], d.bySegment.map((r) => [r.label, money(r.value)])),
      section(t.byPayment, [t.byPayment, t.earned], d.byPaymentMethod.map((r) => [r.label, money(r.value)])),
    ].join('');
  }

  if (payload.tab === 'bookings') {
    const d = payload.data;
    const t = c.bookingsTab;
    return [
      // Three tiles, matching the tab. "Finished" is not among them: it is
      // the biggest slice of the chart below, and a tile for it repeated that
      // chart's headline. Nor is "Still to come" — see the tab.
      section(t.total, TILE_COLUMNS, [
        [t.total, d.kpis.total.value],
        [copy.status.didNotCome, d.kpis.noShow.value],
        [copy.status.cancelled, d.kpis.cancelled.value],
      ]),
      section(t.trend, [DATE, t.total], d.trend.map((p) => [p.label, p.value])),
      section(t.status, [t.status, t.total], d.byStatus.map((r) => [statusWord(r.label), r.value])),
      section(t.source, [t.source, t.total], d.bySource.map((r) => [r.label, r.value])),
    ].join('');
  }

  if (payload.tab === 'services') {
    const d = payload.data;
    const t = c.servicesTab;
    return section(
      t.table,
      [t.colService, t.colBookings, t.colRevenue, t.colAvg, t.colMinutes, t.colRepeat, t.colCancel],
      d.rows.map((r) => [
        // The retired marker rides with the name, as it does on screen, rather
        // than becoming a column the table does not have.
        r.retired ? `${r.name} (${t.retired})` : r.name,
        r.bookings,
        money(r.revenueMinor),
        r.avgPriceMinor === null ? '' : money(r.avgPriceMinor),
        r.durationMin,
        pct(r.repeatPct),
        pct(r.cancelPct),
      ]),
    );
  }

  if (payload.tab === 'staff') {
    const d = payload.data;
    const t = c.staffTab;
    return section(
      t.table,
      [t.colName, t.colBookings, t.colCompleted, t.colRevenue, t.colAvg, t.colUtilisation, t.colNoShow],
      d.rows.map((r) => [
        rowName({ key: r.key, label: r.name }, providerNoun),
        r.bookings,
        r.completed,
        money(r.revenueMinor),
        r.avgValueMinor === null ? '' : money(r.avgValueMinor),
        // Blank, not zero, when a service or outcome filter is on: the hours
        // someone was available cannot be narrowed the same way, so there is
        // no honest figure to write (see StaffReport.utilisationSuppressed).
        pct(r.utilisationPct),
        pct(r.noShowPct),
      ]),
    );
  }

  if (payload.tab === 'customers') {
    const d = payload.data;
    const t = c.customersTab;
    return [
      section(
        c.segmentsTitle,
        BAND_COLUMNS,
        d.segments.map((s) => [
          copy.clients.segments[s.key].label,
          copy.clients.segments[s.key].range,
          s.count,
        ]),
      ),
      section(
        t.top,
        [t.colClient, t.colVisits, t.colSpend, t.colAvg, t.colLast, t.colFavourite, t.colInterval],
        d.topCustomers.map((r) => [
          r.name,
          r.visits,
          money(r.lifetimeSpendMinor),
          money(r.avgSpendMinor),
          r.lastVisitDays,
          r.favouriteService ?? '',
          r.intervalDays ?? '',
        ]),
      ),
    ].join('');
  }

  const d = payload.data;
  const k = c.kpi;
  return [
    section(k.revenue, TILE_COLUMNS, [
      [k.revenue, money(d.kpis.revenueMinor.value)],
      [k.bookings, d.kpis.bookings.value],
      [k.newCustomers, d.kpis.newCustomers.value],
      [k.repeatRate, d.kpis.repeatRatePct.value],
    ]),
    section(c.revenueTrend, [DATE, k.revenue], d.revenueTrend.map((p) => [p.label, money(p.value)])),
    section(c.bookingTrend, [DATE, k.bookings], d.bookingTrend.map((p) => [p.label, p.value])),
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
  // The \ufeff below is a deliberate UTF-8 BOM. Without it Excel opens a UTF-8
  // CSV as latin-1 and a salon's own name comes back mangled. It is not stray
  // whitespace; it is load-bearing, so the rule is silenced rather than the
  // character removed.
  // eslint-disable-next-line no-irregular-whitespace
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
