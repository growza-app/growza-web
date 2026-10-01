/**
 * Jira GRW-160 · GRW-171 — the report shapes — one per tab, plus the filters and the client profile.
 *
 * Split out of a 1,061-line `api.ts` that was 63% type declarations. Types and
 * transport had no reason to share a file; the method table itself is thin and
 * stayed put.
 *
 * These are HAND-WRITTEN mirrors of the server's shapes. There is no shared
 * types package and no generated client — the backend lives outside this
 * Next workspace and nothing bridges them. That is a real gap, filed
 * separately as the shared-row-types work; this commit only stops the mirror
 * being buried in the transport layer.
 */

import type { ReportRowKey } from '@growza-app/shared';

export type ReportRangeKey =
  | 'today'
  | 'last_7_days'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'this_year'
  | 'custom';

export type ReportTabKey =
  | 'overview'
  | 'customers'
  | 'revenue'
  | 'bookings'
  | 'services'
  | 'staff';

export interface ReportRangeMeta {
  key: ReportRangeKey;
  label: string;
  startISO: string;
  endExclusiveISO: string;
  bucketUnit: 'day' | 'week' | 'month';
  buckets: { label: string; startISO: string; endExclusiveISO: string }[];
}

/**
 * A figure and its comparison. `deltaPct` is null when there was no previous
 * period to compare against — the tile then says so rather than showing a 0%
 * that would describe a month that never happened.
 */
export interface ReportMetric {
  value: number;
  previous: number | null;
  deltaPct: number | null;
}

export interface ReportPoint {
  label: string;
  value: number;
}

export type ReportSegmentKey = 'active' | 'due' | 'at_risk' | 'inactive';

export interface ReportSegment {
  key: ReportSegmentKey;
  rangeLabel: string;
  count: number;
}

/**
 * Jira GRW-363 — the code on a row whose name the report chose ("Came back", "Cash", "Unassigned").
 * The screen words it (`useRowName`); `label` is the English the CSV writes. One list, in
 * @growza-app/shared, for the API that writes it and this screen.
 */
export type { ReportRowKey };

export interface ReportNamedValue {
  label: string;
  value: number;
  retired?: boolean;
  key?: ReportRowKey;
}

export interface ReportHeatmap {
  /** English short names. The screen names the rows from `dayNumbers` instead. */
  days: string[];
  /** Jira GRW-363 — each row's weekday, 0 = Sunday. Absent from an API older than this. */
  dayNumbers?: number[];
  hours: string[];
  grid: number[][];
  basis: 'booked_minutes' | 'booking_count';
  outsideOpeningHoursMinutes: number;
}

export interface ReportOpportunity {
  customerId: string;
  name: string;
  initial: string;
  intervalDays: number | null;
  lastVisitDays: number;
  daysOverdue: number | null;
  /** All-time, kept as context. Not what the list is ordered by. */
  lifetimeSpendMinor: number;
  /** What one recovered visit is usually worth — the figure the card shows. */
  avgTicketMinor: number;
  /** Completed bookings as a share of completed + missed; discounts the ticket. */
  showRatePct: number;
}

export type ReportKpiKey =
  | 'revenueMinor'
  | 'bookings'
  | 'completed'
  | 'avgBookingValueMinor'
  | 'newCustomers'
  | 'repeatRatePct';

export interface ReportOverview {
  range: ReportRangeMeta;
  compare: boolean;
  kpis: Record<ReportKpiKey, ReportMetric>;
  revenueTrend: ReportPoint[];
  bookingTrend: ReportPoint[];
  /** One real series per KPI tile, keyed by the same names as `kpis`. */
  sparklines: Record<ReportKpiKey, ReportPoint[]>;
  totalCustomers: number;
  neverVisited: number;
  segments: ReportSegment[];
  topServices: ReportNamedValue[];
  opportunities: ReportOpportunity[];
}


export interface ReportServiceRow {
  id: string;
  name: string;
  bookings: number;
  revenueMinor: number;
  avgPriceMinor: number | null;
  durationMin: number;
  repeatPct: number | null;
  distinctCustomers: number;
  cancelPct: number;
  retired: boolean;
}

export interface ReportProviderRow {
  id: string;
  name: string;
  bookings: number;
  completed: number;
  revenueMinor: number;
  avgValueMinor: number | null;
  utilisationPct: number | null;
  noShowPct: number | null;
  retired: boolean;
  /** Jira GRW-363 — the row for visits recorded with no stylist; its `name` is English. */
  key?: 'unassigned';
}

export interface ReportTopCustomer {
  id: string;
  name: string;
  initial: string;
  visits: number;
  lifetimeSpendMinor: number;
  avgSpendMinor: number;
  lastVisitDays: number | null;
  favouriteService: string | null;
  intervalDays: number | null;
}

export interface ReportRevenue {
  range: ReportRangeMeta;
  compare: boolean;
  kpis: {
    totalRevenueMinor: ReportMetric;
    completedRevenueMinor: ReportMetric;
    avgBookingValueMinor: ReportMetric;
    revenuePerCustomerMinor: ReportMetric;
  };
  trend: ReportPoint[];
  byService: ReportNamedValue[];
  byProvider: ReportNamedValue[];
  showProviders: boolean;
  bySegment: ReportNamedValue[];
  byPaymentMethod: ReportNamedValue[];
}

export interface ReportBookings {
  range: ReportRangeMeta;
  compare: boolean;
  kpis: {
    total: ReportMetric;
    completed: ReportMetric;
    cancelled: ReportMetric;
    noShow: ReportMetric;
  };
  trend: ReportPoint[];
  byStatus: ReportNamedValue[];
  bySource: ReportNamedValue[];
  peakPeriods: ReportHeatmap;
  /** Jira GRW-406 — tokens issued in the range. Optional so an older API does not break the tab. */
  tokens?: { issued: number; waiting?: number; served: number; paid: number; left: number; cancelled: number };
}

export interface ReportServices {
  range: ReportRangeMeta;
  mostBooked: ReportNamedValue[];
  topRevenue: ReportNamedValue[];
  rows: ReportServiceRow[];
}

export interface ReportStaff {
  range: ReportRangeMeta;
  byRevenue: ReportNamedValue[];
  byUtilisation: ReportNamedValue[];
  rows: ReportProviderRow[];
}

export interface ReportCustomers {
  range: ReportRangeMeta;
  compare: boolean;
  kpis: {
    total: ReportMetric;
    newCustomers: ReportMetric;
    avgSpendMinor: ReportMetric;
    overdue: ReportMetric;
  };
  segments: ReportSegment[];
  neverVisited: number;
  opportunities: { key: string; count: number }[];
  spend: ReportNamedValue[];
  frequency: ReportNamedValue[];
  avgIntervalDays: number | null;
  avgVisits: number;
  topCustomers: ReportTopCustomer[];
  /** Share of the period's clients who had been in before. One tile, no chart. */
  repeatRatePct: ReportMetric;
}


/** Facts, not prose — the wording lives in copy.reports.insights. */



export interface ClientProfileRow {
  label: string;
  value: string | number | null;
  kind: 'text' | 'money' | 'days' | 'percent';
  tone?: 'bad' | 'warn';
}

export interface ClientProfile {
  id: string;
  name: string;
  initial: string;
  phone: string;
  sinceISO: string | null;
  visits: number;
  lifetimeSpendMinor: number;
  rows: ClientProfileRow[];
  recent: { service: string; whenISO: string; amountMinor: number }[];
}
