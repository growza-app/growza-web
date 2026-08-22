// Server-side (SSR) talks to the API directly on the host machine. Client-side
// uses a SAME-ORIGIN relative base ('') — the browser calls '/api/...' on
// whatever host served the page, and Next's rewrite (next.config.ts) proxies
// it to the API. One origin means the app works identically over localhost, a
// LAN IP, or an HTTPS tunnel, with no port juggling or mixed-content blocking
// (the latter is what a PWA install over HTTPS requires).
const API_URL = typeof window !== 'undefined' ? '' : (process.env.API_URL ?? 'http://localhost:3001');

export interface Me {
  tenant: { id: string; name: string; timezone: string; locationName: string | null } | null;
  labels: Record<string, string>;
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

export interface Provider {
  id: string;
  displayName: string;
  title: string | null;
  sortOrder: number | null;
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
  /** Ties the legs of one combo/multi-service booking together — null for a plain single-service booking. */
  bookingGroupId: string | null;
  /** The offer/combo package this booking came from, if any — present means it's a real combo, not just several services. */
  offerTitle: string | null;
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
}

export interface CustomerPage {
  rows: Customer[];
  total: number;
}

export interface CustomerStats {
  total: number;
  newThisMonth: number;
  returning: number;
  repeatRatePct: number;
}

export type CustomerStatusFilter = 'all' | 'active' | 'inactive';

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
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new ApiError(res.status, await extractErrorMessage(res, path));
  return res.json() as Promise<T>;
}

async function extractErrorMessage(res: Response, path: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `${path} failed: ${res.status}`;
}

async function send<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 409) {
    throw new BookingConflictError(await extractErrorMessage(res, path));
  }
  if (!res.ok) throw new ApiError(res.status, await extractErrorMessage(res, path));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => send<T>('POST', path, body);
const patch = <T>(path: string, body: unknown) => send<T>('PATCH', path, body);
const del = <T>(path: string) => send<T>('DELETE', path);

/** Multipart upload — deliberately not routed through send(), the browser needs to set its own boundary'd Content-Type, not JSON. */
async function uploadFile<T>(path: string, field: string, file: File): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', body: form });
  if (!res.ok) throw new ApiError(res.status, await extractErrorMessage(res, path));
  return res.json() as Promise<T>;
}

export const api = {
  me: () => get<Me>('/api/v1/me'),
  services: () => get<Service[]>('/api/v1/services'),
  providers: () => get<Provider[]>('/api/v1/providers'),
  appointments: (date?: string, providerId?: string) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (providerId) params.set('providerId', providerId);
    const qs = params.toString();
    return get<Appointment[]>(`/api/v1/appointments${qs ? `?${qs}` : ''}`);
  },
  todayStats: () => get<TodayStats>('/api/v1/analytics/today'),
  // Not /analytics/range — that path segment gets silently blocked by
  // browser ad/tracker blockers (this is fetched client-side, unlike
  // todayStats which runs server-side during SSR and never hits that filter).
  rangeSummary: (range: 'week' | 'month') => get<RangeSummary>(`/api/v1/summary/range?range=${range}`),
  providerDay: (providerId?: string) =>
    get<ProviderDay>(`/api/v1/provider-day${providerId ? `?providerId=${providerId}` : ''}`),
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
  customers: (args: { search?: string; status?: CustomerStatusFilter; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams();
    if (args.search) params.set('search', args.search);
    if (args.status && args.status !== 'all') params.set('status', args.status);
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
