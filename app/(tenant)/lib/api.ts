// Server-side (SSR) talks to the API directly on the host machine. Client-side
// uses a SAME-ORIGIN relative base ('') — the browser calls '/api/...' on
// whatever host served the page, and Next's rewrite (next.config.ts) proxies
// it to the API. One origin means the app works identically over localhost, a
// LAN IP, or an HTTPS tunnel, with no port juggling or mixed-content blocking
// (the latter is what a PWA install over HTTPS requires).
const API_URL = typeof window !== 'undefined' ? '' : (process.env.API_URL ?? 'http://localhost:3001');

/**
 * Jira GRW-66 · GRW-160 — the credential the server-side half of this file
 * would otherwise not send.
 *
 * Every page under `(tenant)` is a server component, so most requests in this
 * file are made by the NEXT SERVER, not the browser — and a server-side `fetch`
 * inherits nothing from the visitor's browser. The session cookie GRW-159 sets
 * would simply not be on the request, and every server-rendered page would 401
 * in production while the client-side calls (same-origin, through the rewrite,
 * cookie attached automatically) carried on working. Exactly the kind of gap
 * that looks fine until it is deployed.
 *
 * `next/headers` is imported dynamically because this module is also bundled
 * into client components, where importing it at the top level is a build error.
 */
const SESSION_COOKIE = 'growza_session';

async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window !== 'undefined') return {};
  try {
    const { cookies } = await import('next/headers');
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return token ? { cookie: `${SESSION_COOKIE}=${token}` } : {};
  } catch {
    // `cookies()` throws outside a request scope (a build-time render, say).
    // No cookie is the honest answer there, and the caller's 401 handling is
    // already correct for it.
    return {};
  }
}

export interface Me {
  tenant: { id: string; name: string; timezone: string; locationName: string | null } | null;
  /**
   * The owner's own billing state, or null when there is nothing to say
   * (GRW-122). Null is the healthy case AND the case where the state could
   * not be resolved — the dashboard shows no banner rather than a false
   * reassurance or a false warning.
   */
  billing: { status: string; message: string | null } | null;
  labels: Record<string, string>;
  /**
   * Jira GRW-66 · GRW-157 — who is signed in.
   *
   * Null when there is no member: the dev fallback with no token, or an API
   * that could not resolve one. The dashboard treats that as OWNER (BR-03),
   * because a degraded session must not silently hide the product from the
   * person who owns it.
   */
  member: { role: 'owner' | 'manager' | 'staff'; providerId: string | null } | null;
  /**
   * Jira GRW-90 · GRW-137 — a platform admin is looking at this account.
   *
   * Null on every ordinary session, which is what keeps the banner off an
   * owner's own dashboard entirely.
   */
  impersonation: { businessName: string; role: string } | null;
  capabilities: {
    walkIn: boolean;
    richAnalytics: boolean;
    staffLeaderboard: boolean;
    providerSelection: boolean;
    maxProviders: number;
  };
}

export interface Service {
  id: string;
  name: string;
  categoryName: string | null;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  priceMinor: string | null;
  currency: string;
  /** Null until a real photo is uploaded — see servicePhotoUrl() for the local-placeholder fallback. */
  imageUrl: string | null;
}

/** A catalogue row as the Services screen edits it — Service plus the fields booking flows never need. */
export interface ServiceAdmin extends Service {
  categoryId: string | null;
  active: boolean;
}

export interface ServiceCategory {
  id: string;
  name: string;
  serviceCount: number;
}

/** The ready-made catalogue for the tenant's pinned vertical (boards 3a/3b). */
export interface SeedCatalogService {
  name: string;
  category: string | null;
  durationMin: number;
  bufferAfterMin: number;
  priceMinor: number | null;
  alreadyHave: boolean;
}

export interface SeedCatalogCategory {
  name: string;
  count: number;
  sample: string[];
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
}

export interface SeedCatalog {
  label: string;
  total: number;
  categories: SeedCatalogCategory[];
  services: SeedCatalogService[];
}

export interface ServiceImportItem {
  mode: 'create' | 'updatePrice';
  existingId?: string;
  name: string;
  categoryName?: string | null;
  durationMin: number;
  bufferAfterMin?: number;
  priceMinor?: number | null;
}

export interface ServiceInput {
  name: string;
  categoryId?: string | null;
  durationMin: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  priceMinor?: number | null;
  active?: boolean;
}

export interface Provider {
  id: string;
  displayName: string;
  title: string | null;
  sortOrder: number | null;
}

export interface ProviderOverviewRow {
  id: string;
  displayName: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  sortOrder: number | null;
  todayBookings: number;
  workingHoursTodayStart: string | null;
  workingHoursTodayEnd: string | null;
  /** Manual "called in sick" override for today only — takes precedence over the working-hours schedule above. */
  unavailableToday: boolean;
  /** Today's booked spans as minutes since local midnight — drives the roster shift bar. */
  todayBookedSegments: { startMin: number; endMin: number }[];
  /** Next scheduled day after today, for the "Back Wednesday, 9:00 AM" line on off-today rows. */
  nextWorkingDay: { dayOffset: number; weekday: number; startTime: string } | null;
}

export interface ProvidersOverview {
  providers: ProviderOverviewRow[];
  topPerformer: { id: string; displayName: string; bookingsCount: number } | null;
}

export interface ProviderWorkingHourRow {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface ProviderDetail {
  id: string;
  displayName: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  bio: string | null;
  languages: string | null;
  hiredAt: string | null;
  active: boolean;
  /** True when workingHours below is a synced copy of the organization's default hours rather than this provider's own — the drawer shows it read-only. */
  usesOrgHours: boolean;
  /** Manual "off today" override — the same switch the roster row carries. */
  unavailableToday: boolean;
  workingHours: ProviderWorkingHourRow[];
  serviceIds: string[];
}

/** Last-30-days scorecard shown in the edit screen's context column. */
export interface ProviderStats {
  bookings: number;
  /** 0–100; null when this provider had no clients in the window. */
  repeatPct: number | null;
  noShows: number;
  bookedMinutes: number;
  scheduledMinutes: number;
}

export interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  createdVia: 'whatsapp' | 'dashboard';
  customerName: string | null;
  customerPhone: string;
  serviceName: string;
  priceMinor: string | null;
  /** What was actually charged at checkout — null until completed; fall back to priceMinor for display. */
  paidAmountMinor: string | null;
  /** How the visit was paid — 'cash' | 'card' | 'upi' | 'other'; null until checkout. */
  paymentMode: string | null;
  providerId: string | null;
  providerName: string | null;
  reminderSent: boolean;
  /** True when this customer had no booking before this day — a first-time (new) customer. */
  customerIsNew: boolean;
  /** Ties the legs of one combo/multi-service booking together — null for a plain single-service booking. */
  bookingGroupId: string | null;
  /** The offer/combo package this booking came from, if any — present means it's a real combo, not just several services. */
  offerTitle: string | null;
  /** The combo package's special price — shown against the combo services' list prices to reveal the discount. */
  comboPriceMinor: string | null;
}

export interface SettingsSummary {
  tenant: {
    id: string;
    name: string;
    timezone: string;
    phone: string;
    email: string;
    description: string;
    logoUrl: string | null;
  };
  location: { id: string; name: string; timezone: string | null; addressLine1: string; addressCity: string } | null;
  booking: {
    slotGranularityMin: number;
    slotPolicy: 'fixed_grid' | 'gap_packed';
    minNoticeMin: number;
    bookingHorizonDays: number;
    cancellationCutoffMin: number;
  };
  reminderRules: Array<{ ruleKey: string; offsetMin: number; template: string }>;
  workingHours: Array<{ weekday: number; startTime: string; endTime: string }>;
}

export interface ActivityEvent {
  id: string;
  topic: 'appointment.confirmed' | 'appointment.cancelled' | 'appointment.rescheduled';
  createdAt: string;
  customerName: string | null;
  startAt: string;
  serviceNames: string[];
}

export interface TodayStats {
  bookingsToday: number;
  bookingsYesterday: number;
  noShowsThisWeek: number;
  noShowsPrevWeek: number;
  revenueTodayMinor: string;
  revenuePrevWeekSameDayMinor: string;
  completedToday: number;
  bookedMinutesToday: number;
  capacityMinutesToday: number;
}

export interface RangeBucket {
  label: string;
  bookings: number;
  isCurrent: boolean;
}

export interface RangeSummary {
  range: 'week' | 'month';
  label: string;
  bookings: number;
  revenueMinor: string;
  noShows: number;
  comparisonPct: number | null;
  busyPct: number;
  buckets: RangeBucket[];
}

export interface ProviderDay {
  provider: { id: string; displayName: string };
  date: string;
  timezone: string;
  entries: Array<{
    startAt: string;
    endAt: string;
    kind: 'booking' | 'block';
    label: string;
    status: string | null;
  }>;
}

export interface AvailabilityResponse {
  service: { id: string; name: string; durationMin: number };
  date: string;
  timezone: string;
  slotCount: number;
  sections: Array<{
    section: string;
    slots: Array<{ utc: string; local: string; assignedProviderId: string | null }>;
  }>;
}

export interface ChatOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface ChatState {
  conversationId: string;
  customerId: string;
  status: 'active' | 'awaiting_input' | 'handoff' | 'completed' | 'abandoned';
  stepKey: string | null;
  type: 'list' | 'buttons' | 'form' | 'end' | 'handoff';
  body: string;
  options: ChatOption[];
  nonce: string | null;
}

export interface Offer {
  id: string;
  title: string;
  description: string | null;
  active: boolean;
  sortOrder: number | null;
  updatedAt: string;
  /** In display order — the combo builder's chosen order, not insertion order. */
  serviceIds: string[];
  /** Set when this offer is a priced combo (not just a discount announcement). */
  comboPriceMinor: string | null;
  /** Rules step — all null means always visible. 0=Sun..6=Sat. */
  visibleWeekdays: number[] | null;
  visibleFrom: string | null;
  visibleUntil: string | null;
  bookingsCount: number;
  revenueMinor: string;
}

export interface OfferInput {
  title: string;
  description?: string | null;
  active?: boolean;
  serviceIds?: string[];
  comboPriceMinor?: number | null;
  visibleWeekdays?: number[] | null;
  visibleFrom?: string | null;
  visibleUntil?: string | null;
}

export interface Customer {
  id: string;
  name: string | null;
  waPhone: string;
  optIn: boolean;
  firstSeenAt: string | null;
  totalBookings: number;
  totalSpentMinor: string;
  lastBookingAt: string | null;
  lastServiceName: string | null;
  /** The band this client is in, from the backend's own rule. Never re-derived here. */
  segment: 'active' | 'due' | 'at_risk' | 'inactive' | 'never';
}

export interface CustomerPage {
  rows: Customer[];
  total: number;
}

export interface CustomerSegmentCount {
  key: 'active' | 'due' | 'at_risk' | 'inactive';
  count: number;
  pct: number;
}

export interface CustomerStats {
  total: number;
  newThisMonth: number;
  returning: number;
  repeatRatePct: number;
  /** Clients with no completed visit — in the total, in none of the bands. */
  neverVisited: number;
  segments: CustomerSegmentCount[];
}

export type CustomerStatusFilter = 'all' | 'active' | 'due' | 'at_risk' | 'inactive' | 'lapsed' | 'never';
export type CustomerSort = 'recent' | 'spent' | 'visits' | 'name';
export type SortDirection = 'asc' | 'desc';

export type AppointmentStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface SearchResult {
  customers: Array<{ id: string; name: string | null; phone: string; visitCount: number }>;
  bookings: Array<{
    id: string;
    startAt: string;
    status: string;
    customerName: string | null;
    customerPhone: string;
    serviceName: string;
    providerName: string | null;
  }>;
}

export interface HoldResponse {
  holdKey: string;
  expiresAt: string;
  providerId: string;
}

export interface ConfirmResponse {
  appointmentId: string;
  remindersScheduled: number;
}

export type PaymentMode = 'cash' | 'card' | 'upi' | 'other';

export interface CheckoutExtraServiceInput {
  serviceId: string;
  paidAmountMinor: number;
  /** Who actually performed it — defaults to the original appointment's provider if omitted. */
  schedulableId?: string;
}

/** An existing sibling leg of a combo booking, completed alongside the primary one. */
export interface CheckoutGroupMemberInput {
  appointmentId: string;
  paidAmountMinor: number;
  schedulableId?: string;
}

export interface CheckoutResponse {
  appointmentId: string;
  originalCancelled: boolean;
  bookingGroupId: string;
  extraAppointmentIds: string[];
}

/** Thrown for the 409s the booking API sends back — the slot-just-taken / hold-expired / already-checked-out cases. */
export class BookingConflictError extends Error {}

/**
 * Any other non-ok response, with the real status and server message
 * preserved — callers that need to react to a specific status (e.g. 404
 * "no active conversation" meaning restart, vs. a generic failure meaning
 * just show an error) can check `.status` instead of string-matching text.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers: await authHeaders() });
  if (!res.ok) throw new ApiError(res.status, await extractErrorMessage(res, path));
  return res.json() as Promise<T>;
}

async function extractErrorMessage(res: Response, path: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
  // `detail` first: the API's capability denials follow 00 §4 and put a
  // machine-readable code in `error` with the sentence in `detail`, so
  // reading `error` alone showed an owner the words "capability_denied".
  // Every other endpoint sends a human message in `error` and no `detail`,
  // so this changes nothing for them.
  return body?.detail ?? body?.error ?? `${path} failed: ${res.status}`;
}


/* ---- Reports (GRW-48) ------------------------------------------------- */

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

export interface ReportNamedValue {
  label: string;
  value: number;
  retired?: boolean;
}

export interface ReportHeatmap {
  days: string[];
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

async function send<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(await authHeaders()),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 409) {
    throw new BookingConflictError(await extractErrorMessage(res, path));
  }
  if (!res.ok) throw new ApiError(res.status, await extractErrorMessage(res, path));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Every Reports tab, through one path builder.
 *
 * Under /reports/, never /analytics/ — these are fetched from the browser on
 * every tab and range change, and that path segment is a common ad-blocker
 * pattern. A blocked first-party request looks exactly like a network
 * failure client-side. Same reasoning as rangeSummary.
 */
function reportGet<T>(
  tab: string,
  range: ReportRangeKey,
  compare: boolean,
  from?: string,
  to?: string,
  filters?: ReportFilters,
) {
  const params = new URLSearchParams({ range, compare: String(compare) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  // Repeated rather than comma-joined: a service called "Cut & Blow-dry, Long"
  // would split a joined list in the wrong place, and `append` is the shape
  // Fastify already parses into an array.
  for (const id of filters?.providerIds ?? []) params.append('providerId', id);
  for (const id of filters?.serviceIds ?? []) params.append('serviceId', id);
  for (const s of filters?.statuses ?? []) params.append('status', s);
  return get<T>(`/api/v1/reports/${tab}?${params.toString()}`);
}

/** What the Filters drawer is narrowing a report to (GRW-60). */
export interface ReportFilters {
  providerIds: string[];
  serviceIds: string[];
  statuses: string[];
}

export interface ReportFilterOption {
  id: string;
  name: string;
  retired: boolean;
}

export interface ReportFilterOptions {
  providers: ReportFilterOption[];
  services: ReportFilterOption[];
}

/**
 * The tabs a filter can honestly narrow.
 *
 * Every figure on these is bookings in a period, which is the row set a
 * filter narrows. Overview, Clients and Insights are not here: their figures
 * are all-time customer recency, or a statement about the whole business, so
 * a per-booking filter would change what the number means rather than which
 * rows it covers.
 */
export const FILTERABLE_REPORT_TABS: ReportTabKey[] = ['revenue', 'bookings', 'services', 'staff'];

export function isFilterableReportTab(tab: ReportTabKey): boolean {
  return FILTERABLE_REPORT_TABS.includes(tab);
}

/** True when no group has a selection, so the report is unnarrowed. */
export function hasNoFilters(filters: ReportFilters): boolean {
  return countFilters(filters) === 0;
}

export function countFilters(filters: ReportFilters): number {
  return filters.providerIds.length + filters.serviceIds.length + filters.statuses.length;
}

const post = <T>(path: string, body: unknown) => send<T>('POST', path, body);
const patch = <T>(path: string, body: unknown) => send<T>('PATCH', path, body);
const del = <T>(path: string) => send<T>('DELETE', path);

/** Multipart upload — deliberately not routed through send(), the browser needs to set its own boundary'd Content-Type, not JSON. */
async function uploadFile<T>(path: string, field: string, file: File): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  // No Content-Type of our own — the browser must set its own boundary'd one.
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', body: form, headers: await authHeaders() });
  if (!res.ok) throw new ApiError(res.status, await extractErrorMessage(res, path));
  return res.json() as Promise<T>;
}

export const api = {
  me: () => get<Me>('/api/v1/me'),
  services: () => get<Service[]>('/api/v1/services'),
  providers: () => get<Provider[]>('/api/v1/providers'),
  /** `date` alone = one day; `date` + `to` = an inclusive day range (the Bookings From/To filter). */
  appointments: (date?: string, to?: string, providerId?: string, customerId?: string) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (to) params.set('to', to);
    if (providerId) params.set('providerId', providerId);
    if (customerId) params.set('customerId', customerId);
    const qs = params.toString();
    return get<Appointment[]>(`/api/v1/appointments${qs ? `?${qs}` : ''}`);
  },
  todayStats: () => get<TodayStats>('/api/v1/analytics/today'),
  /**
   * Reports. Under /reports/, never /analytics/ — this is fetched from the
   * browser on every tab and range change, and that path segment is a common
   * ad-blocker pattern, same reasoning as rangeSummary below.
   */
  reportsOverview: (r: ReportRangeKey, c: boolean, f?: string, t?: string) => reportGet<ReportOverview>('overview', r, c, f, t),
  reportFilterOptions: () => get<ReportFilterOptions>('/api/v1/reports/filters'),
  reportsRevenue: (r: ReportRangeKey, c: boolean, f?: string, t?: string, x?: ReportFilters) => reportGet<ReportRevenue>('revenue', r, c, f, t, x),
  reportsBookings: (r: ReportRangeKey, c: boolean, f?: string, t?: string, x?: ReportFilters) => reportGet<ReportBookings>('bookings', r, c, f, t, x),
  reportsServices: (r: ReportRangeKey, c: boolean, f?: string, t?: string, x?: ReportFilters) => reportGet<ReportServices>('services', r, c, f, t, x),
  reportsStaff: (r: ReportRangeKey, c: boolean, f?: string, t?: string, x?: ReportFilters) => reportGet<ReportStaff>('staff', r, c, f, t, x),
  reportsCustomers: (r: ReportRangeKey, c: boolean, f?: string, t?: string) => reportGet<ReportCustomers>('customers', r, c, f, t),
  /** One client's derived profile, for the card that opens from a row. */
  clientProfile: (id: string) => get<ClientProfile>(`/api/v1/reports/client/${id}`),
  // Not /analytics/range — that path segment gets silently blocked by
  // browser ad/tracker blockers (this is fetched client-side, unlike
  // todayStats which runs server-side during SSR and never hits that filter).
  rangeSummary: (range: 'week' | 'month') => get<RangeSummary>(`/api/v1/summary/range?range=${range}`),
  notifications: (limit = 20) => get<ActivityEvent[]>(`/api/v1/notifications?limit=${limit}`),
  settings: () => get<SettingsSummary>('/api/v1/settings'),
  updateProfile: (body: {
    name?: string;
    timezone?: string;
    phone?: string;
    email?: string;
    description?: string;
    locationName?: string;
    addressLine1?: string;
    addressCity?: string;
  }) => patch<SettingsSummary>('/api/v1/settings/profile', body),
  uploadBusinessLogo: (file: File) => uploadFile<SettingsSummary>('/api/v1/settings/logo', 'logo', file),
  updateBookingRules: (body: {
    slotGranularityMin?: number;
    slotPolicy?: 'fixed_grid' | 'gap_packed';
    minNoticeMin?: number;
    bookingHorizonDays?: number;
    cancellationCutoffMin?: number;
  }) => patch<SettingsSummary>('/api/v1/settings/booking', body),
  updateReminders: (reminderRules: Array<{ ruleKey: string; offsetMin: number; template: string }>) =>
    patch<SettingsSummary>('/api/v1/settings/reminders', { reminderRules }),
  updateOrgWorkingHours: (workingHours: Array<{ weekday: number; startTime: string; endTime: string }>) =>
    patch<SettingsSummary>('/api/v1/settings/working-hours', { workingHours }),
  providerDay: (providerId?: string, date?: string) =>
    get<ProviderDay>(
      `/api/v1/provider-day${providerId || date ? `?${new URLSearchParams({ ...(providerId ? { providerId } : {}), ...(date ? { date } : {}) })}` : ''}`,
    ),
  allServices: () => get<ServiceAdmin[]>('/api/v1/services/all'),
  serviceCategories: () => get<ServiceCategory[]>('/api/v1/service-categories'),
  createService: (body: ServiceInput) => post<ServiceAdmin>('/api/v1/services', body),
  updateService: (id: string, body: Partial<ServiceInput>) => patch<ServiceAdmin>(`/api/v1/services/${id}`, body),
  seedCatalog: () => get<SeedCatalog>('/api/v1/services/seed-catalog'),
  parseServiceSheet: (file: File) => uploadFile<{ headers: string[]; rows: string[][] }>('/api/v1/services/import/parse', 'file', file),
  importServices: (items: ServiceImportItem[]) => post<{ created: number; repriced: number }>('/api/v1/services/import', { items }),
  serviceUsage: (id: string) => get<{ bookings: number; providers: number; offers: number }>(`/api/v1/services/${id}/usage`),
  providersOverview: () => get<ProvidersOverview>('/api/v1/providers/overview'),
  providerDetail: (id: string) => get<ProviderDetail>(`/api/v1/providers/${id}`),
  providerStats: (id: string) => get<ProviderStats>(`/api/v1/providers/${id}/stats`),
  createProvider: (body: {
    displayName: string;
    phone: string;
    title?: string | null;
    email?: string | null;
    bio?: string | null;
    languages?: string | null;
    hiredAt?: string | null;
  }) => post<ProviderDetail>('/api/v1/providers', body),
  updateProviderProfile: (
    id: string,
    body: {
      displayName?: string;
      title?: string | null;
      phone?: string | null;
      email?: string | null;
      bio?: string | null;
      languages?: string | null;
      hiredAt?: string | null;
      active?: boolean;
      usesOrgHours?: boolean;
    },
  ) => patch<ProviderDetail>(`/api/v1/providers/${id}`, body),
  updateProviderWorkingHours: (id: string, workingHours: ProviderWorkingHourRow[]) =>
    patch<{ workingHours: ProviderWorkingHourRow[] }>(`/api/v1/providers/${id}/working-hours`, { workingHours }),
  setProviderAvailabilityToday: (id: string, unavailableToday: boolean) =>
    patch<{ unavailableToday: boolean }>(`/api/v1/providers/${id}/availability-today`, { unavailableToday }),
  updateProviderServices: (id: string, serviceIds: string[]) =>
    patch<{ serviceIds: string[] }>(`/api/v1/providers/${id}/services`, { serviceIds }),
  availability: (serviceId: string, date: string, providerId = 'any') =>
    get<AvailabilityResponse>(`/api/v1/availability?serviceId=${serviceId}&date=${date}&providerId=${providerId}`),
  createHold: (serviceId: string, startAt: string, providerId?: string) =>
    post<HoldResponse>('/api/v1/holds', { serviceId, startAt, providerId }),
  confirmAppointment: (args: {
    holdKey: string;
    serviceId: string;
    startAt: string;
    customerPhone: string;
    customerName?: string;
  }) => post<ConfirmResponse>('/api/v1/appointments', args),
  chatStart: (phone: string, name?: string) => post<ChatState>('/api/v1/chat/start', { phone, name }),
  chatTap: (phone: string, optionId: string, nonce: string) =>
    post<ChatState>('/api/v1/chat/tap', { phone, optionId, nonce }),
  updateAppointmentStatus: (id: string, status: AppointmentStatus) =>
    patch<{ id: string; status: AppointmentStatus }>(`/api/v1/appointments/${id}/status`, { status }),
  checkout: (
    appointmentId: string,
    args: {
      /** Omit when the customer never got the originally booked service — it's cancelled instead of completed. */
      paidAmountMinor?: number;
      schedulableId?: string;
      paymentMode?: PaymentMode;
      extraServices?: CheckoutExtraServiceInput[];
      /** The OTHER already-booked legs of this combo to complete in the same visit — existing appointments, not new ones. */
      groupMembers?: CheckoutGroupMemberInput[];
    },
  ) => post<CheckoutResponse>(`/api/v1/appointments/${appointmentId}/checkout`, args),
  search: (q: string) => get<SearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}`),
  offers: () => get<Offer[]>('/api/v1/offers/all'),
  offer: (id: string) => get<Offer>(`/api/v1/offers/${id}`),
  createOffer: (input: OfferInput) => post<Offer>('/api/v1/offers', input),
  updateOffer: (id: string, input: Partial<OfferInput>) => patch<Offer>(`/api/v1/offers/${id}`, input),
  deleteOffer: (id: string) => del<void>(`/api/v1/offers/${id}`),
  customers: (
    args: {
      search?: string;
      status?: CustomerStatusFilter;
      sort?: CustomerSort;
      direction?: SortDirection;
      limit?: number;
      offset?: number;
    } = {},
  ) => {
    const params = new URLSearchParams();
    if (args.search) params.set('search', args.search);
    if (args.status && args.status !== 'all') params.set('status', args.status);
    if (args.sort && args.sort !== 'recent') params.set('sort', args.sort);
    if (args.direction && args.direction !== 'desc') params.set('direction', args.direction);
    if (args.limit != null) params.set('limit', String(args.limit));
    if (args.offset != null) params.set('offset', String(args.offset));
    const qs = params.toString();
    return get<CustomerPage>(`/api/v1/customers${qs ? `?${qs}` : ''}`);
  },
  customerStats: () => get<CustomerStats>('/api/v1/customers/stats'),
  createCustomer: (input: { phone: string; name?: string }) =>
    post<{ id: string; waPhone: string; name: string | null }>('/api/v1/customers', input),
  uploadServicePhoto: (id: string, file: File) => uploadFile<Service>(`/api/v1/services/${id}/photo`, 'photo', file),
  removeServicePhoto: (id: string) => del<Service>(`/api/v1/services/${id}/photo`),
};

export function formatMoney(minor: string | null, currency = 'INR'): string {
  if (!minor) return '—';
  const amount = Number(minor) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(new Date(iso));
}
