/**
 * Jira GRW-160 · GRW-171 — the shapes every tenant screen reads.
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
  member: {
    role: 'owner' | 'manager' | 'staff' | 'receptionist';
    providerId: string | null;
    /** GRW-202 — the number they signed in with, shown in the account menu. */
    phone?: string | null;
  } | null;
  /**
   * Jira GRW-63 · GRW-197 — the Reports tabs THIS caller may open.
   *
   * Already resolved for the viewer's own role, so the screen never sees what
   * another role was granted. Empty means Reports is not theirs at all.
   *
   * Optional on the wire so an older API does not make the layout throw;
   * absent reads as "every tab", which is the pre-GRW-197 behaviour for the
   * only roles that could reach the screen back then.
   */
  reportTabs?: string[];
  /**
   * Jira GRW-90 · GRW-137 — a platform admin is looking at this account.
   *
   * Null on every ordinary session, which is what keeps the banner off an
   * owner's own dashboard entirely.
   */
  impersonation: { businessName: string; role: string } | null;
  /**
   * Jira GRW-87 · GRW-163 — whether this business can be asked to pay online.
   *
   * Separate from `capabilities` because it is a release decision, not a
   * commercial one: the first salons pay offline and this stays false for them.
   * GRW-145's "Pay now" reads it.
   */
  payments: { online: boolean };
  /**
   * Jira GRW-158 · GRW-165 — whether WhatsApp is live for this business.
   *
   * False for every business until its number is approved and the flag is
   * switched on. The dashboard's job while it is false is to be HONEST: say
   * "coming soon" where a feature depends on messages, and never render a
   * control that implies one will be sent.
   *
   * Optional on the wire so an older API (or a degraded response) does not
   * make the whole layout throw; absent reads as off, which is the safe
   * direction — it says "not yet" about something that already does not work.
   */
  whatsapp?: { booking: boolean };
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
    /** GRW-166 — whether staff see a client's name and phone. True unless the owner turned it off. */
    staffSeesClientContact: boolean;
    /** GRW-170 — grace minutes before an arrival reads as "came late". */
    attendanceLateGraceMin: number;
  };
  /** GRW-197 — report tabs granted per limited role; `{}` means none. */
  reportAccess: Record<string, string[]>;
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

/**
 * Jira GRW-63 · GRW-168 — how many minutes the caller's roster is rostered for.
 *
 * `minutes` is 0 when the range is wider than the API will compute (a client's
 * whole history, say) — `days` still reports the range that was asked for, so
 * the screen can tell "nobody works these days" apart from "too wide to say"
 * and show no percentage rather than a wrong one.
 */
export interface Capacity {
  minutes: number;
  days: number;
  schedulables: number;
}

/**
 * Jira GRW-63 · GRW-170 — one line of the attendance register.
 *
 * Every active person appears for every day in range, marked or not: `status`
 * is null when nobody recorded them, which is a different fact from `absent`.
 * `rostered` says whether they were meant to be in at all — an unmarked day
 * off is not an omission.
 */
export interface AttendanceRow {
  providerId: string;
  displayName: string;
  title: string | null;
  onDate: string;
  status: 'present' | 'late' | 'half_day' | 'absent' | 'leave' | null;
  inAt: string | null;
  outAt: string | null;
  note: string | null;
  markedAt: string | null;
  markedByName: string | null;
  rostered: boolean;
  /** Their own shift start that day as "HH:mm", or null on a day off — what "came late" is measured against. */
  shiftStart: string | null;
}

export interface AttendanceRegister {
  date: string;
  to: string;
  timezone: string;
  today: string;
  /** Minutes past a person's own shift start before an arrival reads as "came late" (GRW-170). */
  lateGraceMin: number;
  rows: AttendanceRow[];
}
