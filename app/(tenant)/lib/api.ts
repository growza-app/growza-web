// Server-side (SSR) talks to the API directly on the host machine. Client-side
// uses a SAME-ORIGIN relative base ('') — the browser calls '/api/...' on
// whatever host served the page, and Next's rewrite (next.config.ts) proxies
// it to the API. One origin means the app works identically over localhost, a
// LAN IP, or an HTTPS tunnel, with no port juggling or mixed-content blocking
// (the latter is what a PWA install over HTTPS requires).
const API_URL = typeof window !== 'undefined' ? '' : (process.env.API_URL ?? 'http://localhost:3001');

/**
 * Jira GRW-310 — `/me` once per server render.
 *
 * The layout, the page and the page title (`generateMetadata`) each asked for it,
 * so a single page load fetched it up to three times, and the dashboard re-renders
 * that whole tree every few seconds on the live screens. `cache` is React's
 * per-request memo: every caller inside one render shares one call, and the next
 * request starts clean. Server only — in the browser it would hold a stale answer
 * for the life of the tab, so the client keeps calling straight through.
 */
const meThisRender = cache(() => get<Me>('/api/v1/me'));

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

// GRW-171 — the shapes moved to their own files; re-exported so every
// existing `import { Service } from '../lib/api'` still resolves.
export * from './api-types';
export * from './report-types';
export * from './home-types';
export * from './branch-types';

// `export *` re-exports for callers but does not bring the names into this
// file's own scope, and the method table below is typed with them.
import { localiseApiMessage } from './api-messages';
import { cache } from 'react';
import type { MyEarnings } from './api-types.js';
import type {
  ActivityEvent,
  Appointment,
  AppointmentStatus,
  AttendanceRegister,
  AttendanceRow,
  AvailabilityResponse,
  Capacity,
  ChairsNow,
  ChatState,
  CheckoutExtraServiceInput,
  CheckoutGroupMemberInput,
  CheckoutResponse,
  ConfirmResponse,
  CustomerPage,
  CustomerSort,
  CustomerStats,
  CustomerStatusFilter,
  HoldResponse,
  Me,
  CreatedOffer,
  Offer,
  OfferInput,
  PaymentMode,
  Provider,
  ProviderDay,
  ProviderDetail,
  ProviderStats,
  ProviderWorkingHourRow,
  ProvidersOverview,
  RangeSummary,
  SearchResult,
  SeedCatalog,
  Service,
  ServiceAdmin,
  ServiceCategory,
  ServiceCategoryAdmin,
  ServiceImportItem,
  ServiceInput,
  SettingsSummary,
  SortDirection,
  TodayStats,
} from './api-types';
import type { DaySummary, HomeOverview, HomePeriod, QueueEntry, TokenBoard } from './home-types';
import type { BranchSettings } from './branch-types';
import type { AutopayStart, BranchClosePreview, OwnerBill, OwnerBilling, OwnerBillPage } from './api-types';
import type {
  ClientProfile,
  ReportBookings,
  ReportCustomers,
  ReportOverview,
  ReportRangeKey,
  ReportRevenue,
  ReportServices,
  ReportStaff,
  ReportTabKey,
} from './report-types';

/**
 * Thrown for the 409s the booking API sends back — the slot-just-taken / hold-expired / already-checked-out
 * cases, and every other 409 besides, because `send()` makes no distinction.
 *
 * Jira GRW-442 — it carries the response body now. A 409 is the API refusing on purpose, and some of them say
 * more than a sentence: retiring a service a package sells answers with the packages that hold it, so the
 * screen can name them and offer the way out. That detail was parsed and thrown away.
 *
 * Optional and untyped at this layer: the shape belongs to the route that sent it, and a caller that only
 * wants the sentence carries on reading `.message` exactly as before.
 */
export class BookingConflictError extends Error {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'BookingConflictError';
  }
}

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
    /**
     * The API's machine-readable `error` field, when it sent one.
     *
     * GRW-164 — a screen that has to branch on WHY it was refused should not be
     * matching on prose. The message is for the person; this is for the code.
     */
    public code?: string,
    /** GRW-164 — support contacts, when the API sent them. Rendered as tappable links. */
    public support?: { phone?: string },
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Jira GRW-230 — `?location=` for a branch's settings, nothing for the business's. */
const atBranch = (location?: string | null) => (location ? `?location=${encodeURIComponent(location)}` : '');

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers: await authHeaders(), signal });
  if (!res.ok) throw await apiError(res, path);
  return res.json() as Promise<T>;
}

/** The one place an error response becomes an ApiError, so `code` can never be dropped by one call site. */
async function apiError(res: Response, path: string): Promise<ApiError> {
  const { message, code, support } = await extractError(res, path);
  return new ApiError(res.status, message, code, support);
}

async function extractError(
  res: Response,
  path: string,
): Promise<{ message: string; code?: string; support?: { phone?: string }; body: unknown }> {
  const body = (await res.json().catch(() => null)) as
    | { error?: string; detail?: string; support?: { phone?: string } }
    | null;
  // `detail` first: the API's capability denials follow 00 §4 and put a
  // machine-readable code in `error` with the sentence in `detail`, so
  // reading `error` alone showed an owner the words "capability_denied".
  // Every other endpoint sends a human message in `error` and no `detail`,
  // so this changes nothing for them.
  const said = body?.detail ?? body?.error ?? `${path} failed: ${res.status}`;
  return {
    // Jira GRW-365 — in the browser, a sentence we have in Hindi shows in Hindi when the page is; the server side
    // (which cannot see the visitor's language here) and every unknown sentence keep the API's own words.
    message: typeof document === 'undefined' ? said : localiseApiMessage(said, document.documentElement.lang),
    code: body?.error,
    ...(body?.support ? { support: body.support } : {}),
    // Jira GRW-442 — a 409 that says more than a sentence needs the rest of it, and the body can only be read once.
    body,
  };
}


/* ---- Reports (GRW-48) ------------------------------------------------- */

async function send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(await authHeaders()),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 409) {
    // Read once: the body is consumed by `extractError`, so it hands back what it parsed (GRW-442).
    const { message, body } = await extractError(res, path);
    throw new BookingConflictError(message, body);
  }
  if (!res.ok) throw await apiError(res, path);
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
  /** Jira GRW-238 — one branch; omitted: the whole business. */
  location?: string | null,
) {
  const params = new URLSearchParams({ range, compare: String(compare) });
  if (location) params.set('location', location);
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
// PUT, not PATCH: an attendance row is identified by (provider, date), so the
// same request twice has to mean the same thing (GRW-170).
const put = <T>(path: string, body: unknown) => send<T>('PUT', path, body);
const del = <T>(path: string) => send<T>('DELETE', path);

/** Multipart upload — deliberately not routed through send(), the browser needs to set its own boundary'd Content-Type, not JSON. */
async function uploadFile<T>(path: string, field: string, file: File): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  // No Content-Type of our own — the browser must set its own boundary'd one.
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', body: form, headers: await authHeaders() });
  if (!res.ok) throw await apiError(res, path);
  return res.json() as Promise<T>;
}

export interface PaymentLink {
  url: string;
  expiresAt: string;
  amountMinor: number;
  currency: string;
  invoiceId: string;
}

export interface PendingInvite {
  id: string;
  phone: string;
  role: string;
  providerId: string | null;
  /** Jira GRW-237 — the branch a receptionist is invited to; null for one branch or a stylist. */
  locationId?: string | null;
  createdAt: string;
  expiresAt: string;
}

/** Jira GRW-237 — somebody who can sign in, and the branch a receptionist works at (null = every branch). */
export interface TeamMember {
  userId: string;
  role: string;
  phone: string | null;
  providerId: string | null;
  providerName: string | null;
  locationId: string | null;
  locationName: string | null;
}

/**
 * Jira GRW-63 · GRW-67 — the token comes back ONCE, on creation, and no route
 * returns it again. The screen has to put it in front of the owner there and
 * then; there is no "show me that link again".
 */
export interface CreatedInvite {
  id: string;
  token: string;
  expiresAt: string;
  resent: boolean;
}

export const api = {
  me: () => (typeof window === 'undefined' ? meThisRender() : get<Me>('/api/v1/me')),
  /** GRW-202 — change your own password. Needs the current one; the session says who you are. */
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    post<{ ok: true }>('/api/v1/auth/change-password', body),
  /**
   * GRW-145 — ask for a hosted page to settle what is owed.
   *
   * Takes nothing: the bill is resolved from the session, so there is no field
   * here that could name somebody else's invoice.
   */
  paymentLink: () => post<PaymentLink>('/api/v1/billing/payment-link', {}),
  /** Jira GRW-241 — asks for the mandate approval page. Returning one means nothing has been approved yet. */
  startAutopay: () => post<AutopayStart>('/api/v1/billing/autopay', {}),
  // Jira GRW-243 — Settings › Billing.
  billing: () => get<OwnerBilling>('/api/v1/billing'),
  // Jira GRW-254 — every bill, and one opened.
  bills: (page = 1) => get<OwnerBillPage>(`/api/v1/billing/invoices?page=${page}`),
  bill: (id: string) => get<OwnerBill>(`/api/v1/billing/invoices/${encodeURIComponent(id)}`),
  /** Jira GRW-379 — `location`: one branch's menu. Absent: every branch's, which a one-branch business has one of. */
  services: (location?: string) => get<Service[]>(`/api/v1/services${location ? `?location=${encodeURIComponent(location)}` : ''}`),
  /**
   * Jira GRW-375 — services closest in MEANING to what was typed. 503 means
   * embeddings are not configured (prod today) or the provider is away; the
   * caller keeps using the browser's own spelling-tolerant matching.
   */
  suggestCatalog: (q: string, location?: string, signal?: AbortSignal) =>
    get<{ hits: Array<{ serviceId: string; score: number }>; floors?: { rescue: number; withMatches: number } }>(
      // Jira GRW-379 — the branch the list is for, so a suggestion is never a service sold elsewhere.
      `/api/v1/catalog/suggest?q=${encodeURIComponent(q)}${location ? `&location=${encodeURIComponent(location)}` : ''}`,
      signal,
    ),
  /**
   * Everyone, or — with `service` (Jira GRW-461) — only the people who can do that one thing.
   *
   * The same question the walk-in write asks before it picks a chair, so a screen can ask it first instead of
   * offering a stylist the save will refuse with "No staff member can perform that service".
   */
  providers: (opts?: { service?: string; location?: string | null }) => {
    const q = new URLSearchParams();
    if (opts?.service) q.set('service', opts.service);
    if (opts?.location) q.set('location', opts.location);
    const qs = q.toString();
    return get<Provider[]>(`/api/v1/providers${qs ? `?${qs}` : ''}`);
  },
  /**
   * GRW-170 — the register for a day or a range, including everybody nobody
   * marked. `location` is Jira GRW-249 — one branch's register; a receptionist
   * has one already and this is ignored for them.
   */
  attendance: (date: string, to?: string, providerId?: string, location?: string | null) =>
    get<AttendanceRegister>(
      `/api/v1/attendance?date=${encodeURIComponent(date)}` +
        `${to ? `&to=${encodeURIComponent(to)}` : ''}` +
        `${providerId ? `&providerId=${encodeURIComponent(providerId)}` : ''}` +
        `${location ? `&location=${encodeURIComponent(location)}` : ''}`,
    ),
  markAttendance: (input: {
    providerId: string;
    date: string;
    status: string;
    inTime?: string | null;
    outTime?: string | null;
    note?: string | null;
  }) => put<AttendanceRow>('/api/v1/attendance', input),
  clearAttendance: (providerId: string, date: string) =>
    del<{ ok: true }>(`/api/v1/attendance?providerId=${encodeURIComponent(providerId)}&date=${encodeURIComponent(date)}`),
  /**
   * GRW-168 — the roster's rostered minutes over a day range, already scoped
   * to the caller. The "busy" figure's denominator; see the route for why it
   * is not computed in the browser.
   */
  capacity: (date: string, to?: string) =>
    get<Capacity>(`/api/v1/capacity?date=${encodeURIComponent(date)}${to ? `&to=${encodeURIComponent(to)}` : ''}`),
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
  /** Jira GRW-222 — the owner's Home. `location` null or absent means the whole business. */
  home: (period: HomePeriod = 'today', location?: string | null) =>
    get<HomeOverview>(`/api/v1/home?period=${period}${location ? `&location=${encodeURIComponent(location)}` : ''}`),
  /** Jira GRW-222 — the walk-in queue. Adding is the arrival; giving to staff is the start. */
  // Jira GRW-244 — `location`: one branch's queue (owner); a receptionist's is their own.
  walkInQueue: (location?: string | null) => get<QueueEntry[]>(`/api/v1/walk-in-queue${atBranch(location)}`),
  addToQueue: (input: { customerId?: string; customerName?: string; customerPhone?: string; /** May be empty (GRW-284). */ serviceIds: string[]; offerId?: string; idempotencyKey?: string; location?: string }) =>
    post<QueueEntry>('/api/v1/walk-in-queue', input),
  /** Jira GRW-284 — `serviceIds` only when the token was issued by name alone. */
  giveToStaff: (entryId: string, schedulableId: string, serviceIds?: string[]) =>
    post<{ appointmentId: string; schedulableId: string; startAt: string; endAt: string; overlapping: boolean }>(`/api/v1/walk-in-queue/${entryId}/give`, {
      schedulableId,
      ...(serviceIds?.length ? { serviceIds } : {}),
    }),
  queueEntryLeft: (entryId: string) => post<{ status: 'left' }>(`/api/v1/walk-in-queue/${entryId}/left`, {}),
  /** Jira GRW-403 — today's tokens with their state. `location`: one branch (owner); a front desk's is their own. */
  tokensToday: (location?: string | null) => get<TokenBoard>(`/api/v1/tokens/today${atBranch(location)}`),
  /** Jira GRW-405 — a booked client has arrived: today's token for that booking (the same one again on a repeat). */
  markArrived: (appointmentId: string) => post<{ id: string; tokenNo: number | null; created: boolean }>('/api/v1/tokens', { appointmentId }),
  daySummary: (location?: string | null) =>
    get<DaySummary>(`/api/v1/home/day-summary${location ? `?location=${encodeURIComponent(location)}` : ''}`),
  /**
   * Reports. Under /reports/, never /analytics/ — this is fetched from the
   * browser on every tab and range change, and that path segment is a common
   * ad-blocker pattern, same reasoning as rangeSummary below.
   */
  reportsOverview: (r: ReportRangeKey, c: boolean, f?: string, t?: string, b?: string | null) => reportGet<ReportOverview>('overview', r, c, f, t, undefined, b),
  // Jira GRW-393 — the drawer offers the report's own branch.
  reportFilterOptions: (branch?: string | null) =>
    get<ReportFilterOptions>(`/api/v1/reports/filters${branch ? `?location=${encodeURIComponent(branch)}` : ''}`),
  reportsRevenue: (r: ReportRangeKey, c: boolean, f?: string, t?: string, x?: ReportFilters, b?: string | null) => reportGet<ReportRevenue>('revenue', r, c, f, t, x, b),
  reportsBookings: (r: ReportRangeKey, c: boolean, f?: string, t?: string, x?: ReportFilters, b?: string | null) => reportGet<ReportBookings>('bookings', r, c, f, t, x, b),
  reportsServices: (r: ReportRangeKey, c: boolean, f?: string, t?: string, x?: ReportFilters, b?: string | null) => reportGet<ReportServices>('services', r, c, f, t, x, b),
  reportsStaff: (r: ReportRangeKey, c: boolean, f?: string, t?: string, x?: ReportFilters, b?: string | null) => reportGet<ReportStaff>('staff', r, c, f, t, x, b),
  reportsCustomers: (r: ReportRangeKey, c: boolean, f?: string, t?: string, b?: string | null) => reportGet<ReportCustomers>('customers', r, c, f, t, undefined, b),
  /** One client's derived profile, for the card that opens from a row. */
  clientProfile: (id: string) => get<ClientProfile>(`/api/v1/reports/client/${id}`),
  // Not /analytics/range — that path segment gets silently blocked by
  // browser ad/tracker blockers (this is fetched client-side, unlike
  // todayStats which runs server-side during SSR and never hits that filter).
  rangeSummary: (range: 'week' | 'month') => get<RangeSummary>(`/api/v1/summary/range?range=${range}`),
  notifications: (limit = 20) => get<ActivityEvent[]>(`/api/v1/notifications?limit=${limit}`),
  /** Jira GRW-310 — an opaque string that changes when anything the live screens show changes. A timeout in the browser, so a stalled request cannot hold the poll shut. */
  liveVersion: (timeoutMs?: number) =>
    get<{ version: string }>('/api/v1/live-version', timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined).then((r) => r.version),
  teamInvites: () => get<{ invites: PendingInvite[] }>('/api/v1/team/invites'),
  createTeamInvite: (body: { phone: string; providerId?: string | null; role?: 'staff' | 'receptionist'; locationId?: string | null }) =>
    post<CreatedInvite>('/api/v1/team/invites', body),
  teamMembers: () => get<{ members: TeamMember[] }>('/api/v1/team/members'),
  setTeamMemberBranch: (userId: string, locationId: string) =>
    patch<{ ok: true }>(`/api/v1/team/members/${userId}`, { locationId }),
  revokeTeamInvite: (id: string) => del<{ ok: true }>(`/api/v1/team/invites/${id}`),
  // Jira GRW-230 — `location`: that branch's settings; omitted: the business defaults.
  settings: (location?: string | null) => get<SettingsSummary>(`/api/v1/settings${atBranch(location)}`),
  resetBranchSettings: (location: string, keys: string[]) =>
    post<SettingsSummary>(`/api/v1/settings/branch-reset${atBranch(location)}`, { keys }),
  /** Jira GRW-396 — this branch's saved values for these keys become every branch's. */
  applyBranchSettingsToAll: (location: string, keys: string[]) =>
    post<SettingsSummary>(`/api/v1/settings/apply-to-all${atBranch(location)}`, { keys }),
  updateProfile: (body: {
    name?: string;
    timezone?: string;
    phone?: string;
    description?: string;
    locationName?: string;
    addressLine1?: string;
    addressCity?: string;
  }, location?: string | null) => patch<SettingsSummary>(`/api/v1/settings/profile${atBranch(location)}`, body),
  branchSettings: () => get<{ branches: BranchSettings[] }>('/api/v1/settings/branches'),
  // Jira GRW-246 — the owner closes a branch, or makes one main; the close shows the new bill first (GRW-240).
  branchClosePreview: (id: string) => get<BranchClosePreview>(`/api/v1/settings/branches/${id}/close-preview`),
  closeBranch: (id: string, reason: string) => post<{ branches: BranchSettings[] }>(`/api/v1/settings/branches/${id}/close`, { reason }),
  makeMainBranch: (id: string, reason: string) => post<{ branches: BranchSettings[] }>(`/api/v1/settings/branches/${id}/make-main`, { reason }),
  updateBranch: (id: string, body: { name?: string; addressLine1?: string; addressCity?: string }) =>
    patch<{ branch: BranchSettings }>(`/api/v1/settings/branches/${id}`, body),
  uploadBusinessLogo: (file: File) => uploadFile<SettingsSummary>('/api/v1/settings/logo', 'logo', file),
  updateBookingRules: (body: {
    slotGranularityMin?: number;
    slotPolicy?: 'fixed_grid' | 'gap_packed';
    minNoticeMin?: number;
    bookingHorizonDays?: number;
    cancellationCutoffMin?: number;
    staffSeesClientContact?: boolean;
    attendanceLateGraceMin?: number;
    reportAccess?: Record<string, string[]>;
    closedDates?: string[];
    /** Jira GRW-397 — every branch's closed days, a day at a time (business only). */
    closedDatesAdd?: string[];
    closedDatesRemove?: string[];
  }, location?: string | null) => patch<SettingsSummary>(`/api/v1/settings/booking${atBranch(location)}`, body),
  updateReminders: (reminderRules: Array<{ ruleKey: string; offsetMin: number; template: string }>, location?: string | null) =>
    patch<SettingsSummary>(`/api/v1/settings/reminders${atBranch(location)}`, { reminderRules }),
  updateOrgWorkingHours: (workingHours: Array<{ weekday: number; startTime: string; endTime: string }>, location?: string | null) =>
    patch<SettingsSummary>(`/api/v1/settings/working-hours${atBranch(location)}`, { workingHours }),
  providerDay: (providerId?: string, date?: string) =>
    get<ProviderDay>(
      `/api/v1/provider-day${providerId || date ? `?${new URLSearchParams({ ...(providerId ? { providerId } : {}), ...(date ? { date } : {}) })}` : ''}`,
    ),
  /*
   * Jira GRW-216 — takes no provider id, deliberately. The route reads the one
   * on the caller's own session, so asking for a colleague's earnings is not a
   * check the frontend could forget — it is a request that cannot be made.
   *
   * 403 when the owner has not turned this on for them, which the caller must
   * distinguish from zero earnings: a stylist on revenue share who saw a blank
   * would reasonably conclude none of their work had been recorded.
   */
  myEarnings: () => get<MyEarnings>('/api/v1/my-earnings'),
  /*
   * Jira GRW-218 — correcting a client.
   *
   * PATCH, and the body is built by the caller so that omitting a key means
   * "leave it alone" while an explicit null means "clear it". A walk-in may
   * legitimately have no name and no number, so those two cases must stay
   * distinguishable all the way to the column.
   */
  updateCustomer: (id: string, body: { name?: string | null; phone?: string | null }) =>
    patch<{ id: string; name: string | null; waPhone: string | null }>(`/api/v1/customers/${id}`, body),
  /** Jira GRW-378 — one branch's catalogue; the Services screen always names the branch it shows. */
  allServices: (location: string) => get<ServiceAdmin[]>(`/api/v1/services/all?location=${encodeURIComponent(location)}`),
  serviceCategories: (location?: string | null) =>
    get<ServiceCategory[]>(`/api/v1/service-categories${location ? `?location=${encodeURIComponent(location)}` : ''}`),
  /**
   * Jira GRW-428 — the Services screen's own category list: one branch, empty categories included.
   *
   * `serviceCategories` above is the picker's list and leaves an empty category out, which would make a
   * category the owner has just created disappear the moment the screen reloaded.
   */
  categoriesAtBranch: (location: string) =>
    get<ServiceCategoryAdmin[]>(`/api/v1/service-categories/all?location=${encodeURIComponent(location)}`),
  createCategory: (location: string, name: string) =>
    post<ServiceCategoryAdmin>('/api/v1/service-categories', { name, locationId: location }),
  renameCategory: (location: string, id: string, name: string) =>
    patch<ServiceCategoryAdmin>(`/api/v1/service-categories/${id}?location=${encodeURIComponent(location)}`, { name }),
  /** Answers how many services were left with no category — the number the confirmation promised. */
  deleteCategory: (location: string, id: string) =>
    del<{ released: number }>(`/api/v1/service-categories/${id}?location=${encodeURIComponent(location)}`),
  /**
   * Jira GRW-428 — retires several of one branch's services at once.
   *
   * Retire, not delete: a service is referenced by its bookings, its stylists' skills and any combo it is in.
   * A list with a service of another branch in it refuses the whole call rather than retiring the rest.
   */
  retireServices: (location: string, serviceIds: string[]) =>
    post<{ ok: true; retired: number }>('/api/v1/services/retire', { locationId: location, serviceIds }),
  /**
   * Jira GRW-431 — deletes several of one branch's services outright.
   *
   * Partial on purpose, unlike `retireServices`: a service inside a combo is the catalogue's own state, not a
   * broken request, so the rest go and `blocked` names the ones that did not with what is in their way.
   */
  deleteServices: (location: string, serviceIds: string[]) =>
    post<{
      ok: true;
      deleted: number;
      bookingsKept: number;
      blocked: Array<{ id: string; name: string; blockers: { offers: Array<{ id: string; title: string }>; questions: Array<{ id: string; label: string }>; waitingInQueue: number } }>;
    }>('/api/v1/services/delete', { locationId: location, serviceIds }),
  /** One service, gone for good. Its bookings keep the name and price they were taken at (Jira GRW-430). */
  deleteService: (location: string, id: string) =>
    del<{ ok: true; bookingsKept: number }>(`/api/v1/services/${id}?location=${encodeURIComponent(location)}`),
  /** The whole branch's order, every time: a partial list is refused rather than half-applied. */
  reorderCategories: (location: string, categoryIds: string[]) =>
    post<ServiceCategoryAdmin[]>('/api/v1/service-categories/reorder', { locationId: location, categoryIds }),
  createService: (location: string, body: ServiceInput) => post<ServiceAdmin>('/api/v1/services', { ...body, locationId: location }),
  /** Jira GRW-378 — copy all (no ids) or some of another branch's services here; names already here are skipped. */
  copyServicesFromBranch: (from: string, to: string, serviceIds?: string[]) =>
    post<{ added: number; skipped: string[] }>('/api/v1/services/copy-from-branch', {
      fromLocationId: from,
      toLocationId: to,
      ...(serviceIds ? { serviceIds } : {}),
    }),
  updateService: (id: string, body: Partial<ServiceInput>) => patch<ServiceAdmin>(`/api/v1/services/${id}`, body),
  seedCatalog: (location: string) => get<SeedCatalog>(`/api/v1/services/seed-catalog?location=${encodeURIComponent(location)}`),
  parseServiceSheet: (file: File) => uploadFile<{ headers: string[]; rows: string[][] }>('/api/v1/services/import/parse', 'file', file),
  importServices: (location: string, items: ServiceImportItem[]) =>
    post<{ created: number; repriced: number }>('/api/v1/services/import', { items, locationId: location }),
  serviceUsage: (id: string) => get<{ bookings: number; providers: number; offers: number }>(`/api/v1/services/${id}/usage`),
  providersOverview: () => get<ProvidersOverview>('/api/v1/providers/overview'),
  providerDetail: (id: string) => get<ProviderDetail>(`/api/v1/providers/${id}`),
  providerStats: (id: string) => get<ProviderStats>(`/api/v1/providers/${id}/stats`),
  createProvider: (body: {
    displayName: string;
    phone: string;
    /** Jira GRW-234 — which branch; omitted means the main branch. */
    locationId?: string;
    title?: string | null;
    bio?: string | null;
    languages?: string | null;
    hiredAt?: string | null;
    /** GRW-183 — omitted means "follows the salon's hours", which is what almost every new hire does. */
    usesOrgHours?: boolean;
    /**
     * GRW-22 — the wizard's steps 3 and 2, sent with step 1.
     *
     * Omitting `serviceIds` means EVERY active service; omitting
     * `workingHours` keeps GRW-183's "follow the salon". Both defaults exist so
     * that "Save & close" from step 1 leaves a usable stylist rather than one
     * who is in the team list and bookable for nothing.
     *
     * They travel with the create rather than as follow-up requests because a
     * create that succeeds and a follow-up that fails is exactly the half-made
     * record this ticket is about.
     */
    serviceIds?: string[];
    workingHours?: ProviderWorkingHourRow[];
  }) => post<ProviderDetail>('/api/v1/providers', body),
  updateProviderProfile: (
    id: string,
    body: {
      displayName?: string;
      title?: string | null;
      phone?: string | null;
      bio?: string | null;
      languages?: string | null;
      hiredAt?: string | null;
      active?: boolean;
      usesOrgHours?: boolean;
      /** Jira GRW-216 — absent leaves it alone; the server COALESCEs. */
      seesOwnRevenue?: boolean;
      /** Jira GRW-234 — move to another branch; absent leaves it where it is. */
      locationId?: string;
      /** Jira GRW-386 — on a move: their services matched by name at the new branch, or none. */
      skillsOnMove?: 'match' | 'none';
    },
    // Jira GRW-386 — on a move, the services the new branch has no match for.
  ) => patch<ProviderDetail & { unmatchedSkills?: string[] }>(`/api/v1/providers/${id}`, body),
  updateProviderWorkingHours: (id: string, workingHours: ProviderWorkingHourRow[]) =>
    patch<{ workingHours: ProviderWorkingHourRow[] }>(`/api/v1/providers/${id}/working-hours`, { workingHours }),
  setProviderAvailabilityToday: (id: string, unavailableToday: boolean) =>
    patch<{ unavailableToday: boolean }>(`/api/v1/providers/${id}/availability-today`, { unavailableToday }),
  updateProviderServices: (id: string, serviceIds: string[]) =>
    patch<{ serviceIds: string[] }>(`/api/v1/providers/${id}/services`, { serviceIds }),
  /**
   * `serviceId` may repeat — the API sums the chain into one span (GRW-199).
   *
   * Built with `URLSearchParams` and `append`, not interpolated: an array
   * dropped into a template literal comma-joins, which Fastify would parse as
   * ONE id containing a comma and the lookup would 404. Same trap `reportGet`
   * documents a few lines above for provider and service filters.
   */
  availability: (serviceId: string | string[], date: string, providerId = 'any', location?: string | null) => {
    const params = new URLSearchParams({ date, providerId });
    // Jira GRW-235 — free times at one branch; omitted: every branch.
    if (location) params.set('location', location);
    for (const id of ([] as string[]).concat(serviceId)) params.append('serviceId', id);
    return get<AvailabilityResponse>(`/api/v1/availability?${params.toString()}`);
  },
  createHold: (serviceId: string, startAt: string, providerId?: string) =>
    post<HoldResponse>('/api/v1/holds', { serviceId, startAt, providerId }),
  confirmAppointment: (args: {
    holdKey: string;
    serviceId: string;
    startAt: string;
    /** GRW-166 — both ABSENT when the salon withholds client identity from staff. */
    customerPhone?: string;
    customerName?: string;
  }) => post<ConfirmResponse>('/api/v1/appointments', args),
  /** Jira GRW-385 — `branch`: a branch's booking link, opened in the demo; the chat starts there without asking. */
  chatStart: (phone: string, name?: string, branch?: string) => post<ChatState>('/api/v1/chat/start', { phone, name, ...(branch ? { branch } : {}) }),
  chatTap: (phone: string, optionId: string, nonce: string) =>
    post<ChatState>('/api/v1/chat/tap', { phone, optionId, nonce }),
  /** Jira GRW-318 — `wholeBooking` applies a cancel or a no-show to every still-confirmed service of the visit. */
  updateAppointmentStatus: (id: string, status: AppointmentStatus, wholeBooking = false) =>
    patch<{ id: string; status: AppointmentStatus }>(`/api/v1/appointments/${id}/status`, wholeBooking ? { status, wholeBooking: true } : { status }),
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
      /** Jira GRW-314 — the combo's other legs the customer never had: cancelled, chair released. */
      cancelMemberIds?: string[];
    },
  ) => post<CheckoutResponse>(`/api/v1/appointments/${appointmentId}/checkout`, args),
  /**
   * Jira GRW-219 — move a booking to another time.
   *
   * Addressed by ANY leg of the visit: a combo moves as one, so the caller
   * hands over the row the receptionist tapped rather than working out which
   * of three appointments is the first one.
   *
   * `overlapping` in the response means it was recorded on a chair that is
   * already taken — the booking exists either way, and the sheet says so.
   */
  rescheduleAppointment: (
    appointmentId: string,
    args: { startAt: string; schedulableId?: string | null },
  ) =>
    post<{
      appointmentId: string;
      bookingGroupId: string;
      startAt: string;
      endAt: string;
      overlapping: boolean;
      remindersScheduled: number;
    }>(`/api/v1/appointments/${appointmentId}/reschedule`, args),
  search: (q: string) => get<SearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}`),
  // Jira GRW-395 — one branch's combos (and the announcements); none is every branch.
  offers: (location?: string | null) => get<Offer[]>(`/api/v1/offers/all${atBranch(location)}`),
  offer: (id: string) => get<Offer>(`/api/v1/offers/${id}`),
  createOffer: (input: OfferInput) => post<CreatedOffer>('/api/v1/offers', input),
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
      /** Jira GRW-392 — one branch's clients; absent is every branch's (a receptionist always gets their own). */
      location?: string | null;
    } = {},
  ) => {
    const params = new URLSearchParams();
    if (args.location) params.set('location', args.location);
    if (args.search) params.set('search', args.search);
    if (args.status && args.status !== 'all') params.set('status', args.status);
    if (args.sort && args.sort !== 'recent') params.set('sort', args.sort);
    if (args.direction && args.direction !== 'desc') params.set('direction', args.direction);
    if (args.limit != null) params.set('limit', String(args.limit));
    if (args.offset != null) params.set('offset', String(args.offset));
    const qs = params.toString();
    return get<CustomerPage>(`/api/v1/customers${qs ? `?${qs}` : ''}`);
  },
  customerStats: (location?: string | null) =>
    get<CustomerStats>(`/api/v1/customers/stats${location ? `?location=${encodeURIComponent(location)}` : ''}`),
  /** Jira GRW-392 — `locationId`: the branch whose client this is; absent is the main branch (or the desk's own). */
  createCustomer: (input: { phone: string; name?: string; locationId?: string }) =>
    post<{ id: string; waPhone: string | null; name: string | null }>('/api/v1/customers', input),
  /**
   * Jira GRW-199 — record a walk-in. Not `confirmAppointment`: there is no
   * hold, no future `startAt`, and this must succeed when every chair is taken.
   */
  /**
   * GRW-198 — every chair and who is in it, right now.
   *
   * Not availability: working hours and lead time are irrelevant to somebody
   * already standing in the room. The only question is whether the chair is
   * taken, and if so by whom and for how much longer.
   */
  chairs: () => get<ChairsNow>('/api/v1/chairs'),
  createWalkIn: (input: {
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    serviceIds: string[];
    offerId?: string;
    schedulableId?: string;
    /** Jira GRW-235 — the branch; "whoever is free" is picked from its staff. */
    location?: string;
    /** GRW-198 — the booking whose chair this walk-in is taking over. */
    reclaimAppointmentId?: string;
    /**
     * GRW-204 — one token per attempt, so a retry is not a second visit.
     *
     * Generated when the sheet opens and reused across every retry of the same
     * Start. The failure it exists for is not a double-tap — the button
     * disables itself — it is a request that SUCCEEDS and whose response never
     * arrives on a salon's wifi, leaving the receptionist looking at an error
     * for a visit that was already recorded.
     */
    idempotencyKey?: string;
  }) =>
    post<{
      appointmentId: string;
      /** Jira GRW-403 — the token this walk-in was given (the branch's next number). */
      tokenNo: number | null;
      bookingGroupId: string | null;
      customerId: string;
      schedulableId: string;
      startAt: string;
      endAt: string;
      overlapping: boolean;
      legs: { appointmentId: string; serviceId: string; startAt: string; endAt: string; overlapping: boolean }[];
    }>('/api/v1/walk-ins', input),
  /**
   * Jira GRW-293 (epic GRW-283) — a paid visit with no stylist. "Record
   * payment" only: `noStylist: true` is the only way this route is ever
   * called from the sheet — Walk-in now and For later keep `createWalkIn` /
   * `createBooking` untouched, always with a chair.
   */
  recordCounterSale: (
    input: {
      /** Jira GRW-403 — paying a waiting token: the server takes its client and branch from it. */
      queueEntryId?: string;
      customerId?: string;
      customerName?: string;
      customerPhone?: string;
      services: { serviceId: string; paidAmountMinor: number }[];
      offerId?: string;
      paymentMode?: PaymentMode;
      idempotencyKey?: string;
      location?: string;
      // The route refuses to guess: exactly one of these (GRW-293). A named stylist only when paying a token (GRW-403).
    } & ({ noStylist: true; schedulableId?: never } | { schedulableId: string; noStylist?: never }),
  ) =>
    post<{
      appointmentId: string;
      /** Jira GRW-403 — the token paid, or the one this sale was given. */
      tokenNo: number | null;
      bookingGroupId: string | null;
      customerId: string;
      schedulableId: string | null;
      stylistUnassigned: boolean;
      startAt: string;
      endAt: string;
      overlapping: boolean;
      legs: { appointmentId: string; serviceId: string; paidAmountMinor: number; startAt: string; endAt: string }[];
    }>('/api/v1/counter-sales', input),
  /**
   * Jira GRW-199 — an advance booking, in one request.
   *
   * The two-step `createHold` + `confirmAppointment` pair stays for the
   * free-times screen. This one resolves the client by id (or creates them),
   * books 1..N services as one visit, and refuses with a 409 when the slot went
   * — which `BookingConflictError` already carries.
   */
  createBooking: (input: {
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    serviceIds: string[];
    offerId?: string;
    startAt: string;
    schedulableId?: string;
    /** Jira GRW-235 — the branch; "whoever is free" is picked from its staff. */
    location?: string;
  }) =>
    post<{
      appointmentIds: string[];
      appointmentId: string;
      customerId: string;
      schedulableId: string;
      startAt: string;
      endAt: string;
      remindersScheduled: number;
    }>('/api/v1/bookings', input),
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
