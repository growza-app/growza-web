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
  | 'todo'
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
  /** Jira GRW-478 — each column's hour, 0–23, so the screen can name it in the owner's language. */
  hourNumbers?: number[];
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

/** Jira GRW-567 — one scorecard line: the figure, and the same figure for the period before (null = nothing to compare with). */
export interface ScorecardLine {
  value: number;
  previous: number | null;
}

export type ScorecardVs = 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface Scorecard {
  vs: ScorecardVs;
  money: ScorecardLine;
  visits: ScorecardLine;
  newClients: ScorecardLine;
  /** People with two or more visits in the period — a count, not a rate. */
  cameBack: ScorecardLine;
  noShows: ScorecardLine;
}

export interface ReportOverview {
  range: ReportRangeMeta;
  compare: boolean;
  /** Always against the period before, whatever `compare` says. */
  scorecard: Scorecard;
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

/** Jira GRW-568 — what one offer brought in, and what it cost in discount. */
export interface ReportOfferRow {
  id: string;
  title: string;
  bookings: number;
  revenueMinor: number;
  discountMinor: number;
  retired: boolean;
}

/** Jira GRW-568 — WhatsApp, booked ahead at the desk, walked in. */
export interface ReportBookingSources {
  whatsapp: number;
  bookedAhead: number;
  walkIn: number;
}

/** Jira GRW-568 — moved, and cancelled by whom. */
export interface ReportBookingEndings {
  moved: number;
  cancelledByCustomer: number;
  cancelledBySalon: number;
  cancelledOther: number;
}

/** Jira GRW-568 — who an offer can reach. */
export interface ReportReach {
  reachable: number;
  noPhone: number;
  optedOut: number;
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
  /** Jira GRW-568 — booked less paid at the till. Optional so an older API does not break the table. */
  discountMinor?: number;
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
  /** Jira GRW-568 — each offer's bookings, money and discount. Optional for an older API. */
  offers?: ReportOfferRow[];
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
  /** Jira GRW-568 — three sources; the tab falls back to `bySource` for an older API. */
  sources?: ReportBookingSources;
  /** Jira GRW-568 — moved, and cancelled by whom. */
  endings?: ReportBookingEndings;
  peakPeriods: ReportHeatmap;
  /** Jira GRW-406 — tokens issued in the range. Optional so an older API does not break the tab. */
  tokens?: { issued: number; waiting?: number; served: number; paid: number; left: number; cancelled: number; avgWaitMin?: number | null };
}

export interface ReportServices {
  range: ReportRangeMeta;
  mostBooked: ReportNamedValue[];
  topRevenue: ReportNamedValue[];
  /** Jira GRW-568 — money by category; "Other" (key `other`) for services without one. */
  byCategory?: ReportNamedValue[];
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
  /** Jira GRW-568 — who an offer can reach. */
  reach?: ReportReach;
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

/* ---- What to do (the first tab) ---------------------------------------- */

export type TodoTone = 'good' | 'warn' | 'bad';

/** A client the owner can act on from a card. `waPhone` is null when they may not be messaged. */
export interface TodoClient {
  customerId: string;
  name: string;
  initial: string;
  waPhone: string | null;
  optedOut: boolean;
  lastVisitDays: number | null;
  intervalDays: number | null;
  avgTicketMinor: number | null;
  usualService: string | null;
}

export type TodoCard =
  | { kind: 'money'; tone: TodoTone; revenueMinor: number; previousMinor: number | null; bookings: number }
  | { kind: 'dueBack'; tone: TodoTone; count: number; clients: TodoClient[] }
  | { kind: 'stopped'; tone: TodoTone; count: number; clients: TodoClient[] }
  | { kind: 'noShow'; tone: TodoTone; count: number; clients: TodoClient[] }
  | { kind: 'quietHours'; tone: TodoTone; weekday: number; fromHour: number; toHour: number }
  | { kind: 'bestEarner'; tone: TodoTone; service: string; revenueMinor: number; bookings: number }
  | { kind: 'unreachable'; tone: TodoTone; count: number; noPhone: number; optedOut: number };

export interface ReportTodo {
  weekStartISO: string;
  weekEndExclusiveISO: string;
  monthLabel: string;
  cards: TodoCard[];
  possible: number;
}
