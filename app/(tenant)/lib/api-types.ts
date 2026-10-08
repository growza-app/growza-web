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
  /** Jira GRW-556 — `status` is the business's lifecycle: while `provisioning` only the setup screens are offered. Absent from an older API. */
  tenant: { id: string; name: string; timezone: string; locationName: string | null; branchCount?: number; status?: string } | null;
  /** Jira GRW-235 — open branches, main first. */
  branches?: Array<{ id: string; name: string }>;
  /**
   * The owner's own billing state, or null when there is nothing to say
   * (GRW-122). Null is the healthy case AND the case where the state could
   * not be resolved — the dashboard shows no banner rather than a false
   * reassurance or a false warning.
   */
  billing: {
    status: string;
    message: string | null;
    /**
     * Jira GRW-413 — AutoPay has halted, and the two things that recover it are
     * the owner's to do: re-approve it, or pay the open bill. The warning names
     * them, because nothing Growza does will collect this money on its own.
     * False when this deployment cannot take money online at all.
     */
    autopayHalted?: boolean;
  } | null;
  /**
   * Jira GRW-516 — what a business still being set up is waiting on, one row per thing, met or not. Null once it is live
   * (and when the API could not say).
   */
  setup?: { items: Array<{ key: string; met: boolean; branchName?: string }> } | null;
  /**
   * Jira GRW-242 — owner only: the next bill has outgrown the AutoPay amount
   * they approved, and they are asked to approve the new one before the
   * billing date. Null for every other role, and when nothing is asked.
   */
  autopayRenewal?: AutopayRenewal | null;
  /** Jira GRW-556 (follow-up) — a payment the provider recorded in the last two hours; Home says it arrived. Owner only. */
  paymentReceived?: { amountMinor: number; currency: string; paidOn: string } | null;
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
    /** Jira GRW-237 — a receptionist's own branch; null means every branch. */
    locationId?: string | null;
    locationName?: string | null;
    /** Jira GRW-251 — their branch has been closed and they have not been moved. */
    locationClosed?: boolean;
    /** Jira GRW-251 — "HH:mm" their branch closes today; null when closed today or one branch. */
    locationClosesAt?: string | null;
    /** Jira GRW-251 — false: closed today; null: not known. */
    locationOpenToday?: boolean | null;
    /** Jira GRW-329 — the language on this person's account. Null means never chosen, which reads as English. */
    lang?: string | null;
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
  /** `demo` — Jira GRW-266 · GRW-271: whether this server has the Try WhatsApp simulator at all (off in production). */
  whatsapp?: { booking: boolean; demo?: boolean };
  capabilities: {
    walkIn: boolean;
    /** GRW-219 — may a booking be moved to another time. Read by `BookingSheet`. */
    reschedule: boolean;
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
  /**
   * Jira GRW-560 — which pack concept this service is, decided by the API at write
   * time and kept through a rename. The dashboard turns it into a picture only when
   * the pack has that one; see `servicePhotoUrl`.
   */
  catalogKey?: string | null;
  /** Null until a real photo is uploaded — see servicePhotoUrl() for the pack and placeholder fallback. */
  imageUrl: string | null;
  /** Jira GRW-378 · GRW-379 — the one branch this service is sold at. */
  locationId: string;
}

/** A catalogue row as the Services screen edits it — Service plus the fields booking flows never need. */
export interface ServiceAdmin extends Service {
  categoryId: string | null;
  active: boolean;
  /**
   * Jira GRW-482 — how many of this branch's stylists can perform it.
   *
   * Zero means it is on the menu and bookable by nobody. Optional because an older
   * API will not send it, and a missing count must not be read as a warning.
   */
  providerCount?: number;
}

export interface ServiceCategory {
  id: string;
  name: string;
  serviceCount: number;
}

/**
 * Jira GRW-428 — a category as the Services screen manages it, which is not quite as a picker sees it.
 *
 * `serviceCount` counts retired services too, because it is what a delete would set loose and so what the
 * confirmation has to say out loud; `activeCount` is what is on the menu today. A category with both at zero is
 * normal here and impossible in `ServiceCategory` — that list leaves empty categories out on purpose.
 */
export interface ServiceCategoryAdmin extends ServiceCategory {
  sortOrder: number | null;
  activeCount: number;
}

/** The ready-made catalogue for the tenant's pinned vertical (boards 3a/3b). */
export interface SeedCatalogService {
  name: string;
  /** Jira GRW-560 — travels with the pick, so the row it creates is keyed exactly rather than matched by name. */
  catalogKey: string | null;
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
  /** Jira GRW-560 — only the ready-made catalogue knows this; a spreadsheet has none and the API matches on the name. */
  catalogKey?: string | null;
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
  /**
   * Jira GRW-559 — their photo, or null/absent for the lettered tile.
   *
   * Optional, unlike the staff screen's copy: the booking sheet and Record payment read this
   * all day and the API can be a deploy behind the dashboard. An absent field draws initials.
   */
  photoUrl?: string | null;
  /** Jira GRW-235 — which branch they work at (the booking sheet narrows by it). */
  locationId?: string;
  title: string | null;
  sortOrder: number | null;
}

export interface ProviderOverviewRow {
  id: string;
  displayName: string;
  /** Jira GRW-559 — this person's photo, already a URL by the time it leaves the API. Null draws their initials. */
  photoUrl: string | null;
  /** Jira GRW-234 — the branch this person works at. `branchLabel` is set by the Staff screen only for a multi-branch business. */
  locationId?: string;
  locationName?: string;
  branchLabel?: string;
  title: string | null;
  phone: string | null;
  active: boolean;
  sortOrder: number | null;
  todayBookings: number;
  workingHoursTodayStart: string | null;
  workingHoursTodayEnd: string | null;
  /** Manual "called in sick" override for today only — takes precedence over the working-hours schedule above. */
  /** GRW-183 — false means nobody can book them on any day, which is different from a day off or a sick day. */
  hasWorkingHours: boolean;
  unavailableToday: boolean;
  /** Today's booked spans as minutes since local midnight — drives the roster shift bar. */
  todayBookedSegments: { startMin: number; endMin: number }[];
  /** Next scheduled day after today, for the "Back Wednesday, 9:00 AM" line on off-today rows. */
  nextWorkingDay: { dayOffset: number; weekday: number; startTime: string } | null;
}

export interface ProvidersOverview {
  providers: ProviderOverviewRow[];
  topPerformer: { id: string; displayName: string; bookingsCount: number } | null;
  /** Jira GRW-395 — each branch's own top performer, by branch id; a branch with no bookings is absent. */
  topByBranch?: Record<string, { id: string; displayName: string; bookingsCount: number }>;
  /** Jira GRW-557 — each open branch's places for people (its own number, else the plan's). Absent from an older API. */
  placesByBranch?: Record<string, number>;
}

export interface ProviderWorkingHourRow {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface ProviderDetail {
  id: string;
  displayName: string;
  /** Jira GRW-559 — this person's photo, already a URL by the time it leaves the API. Null draws their initials. */
  photoUrl: string | null;
  /** Jira GRW-234 — the branch this person works at. */
  locationId?: string;
  locationName?: string;
  title: string | null;
  phone: string | null;
  bio: string | null;
  languages: string | null;
  hiredAt: string | null;
  active: boolean;
  /** True when workingHours below is a synced copy of the organization's default hours rather than this provider's own — the drawer shows it read-only. */
  usesOrgHours: boolean;
  /** Jira GRW-216 — is this stylist shown the takings from their own bookings. */
  seesOwnRevenue: boolean;
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
  /**
   * GRW-199 — NULL for a walk-in who gave no number.
   *
   * Was `string` until walk-ins were allowed without a phone. Every call
   * button, `wa.me` link and `dialable()` call site has to decide what it shows
   * when there is nothing to dial; typing it honestly is what makes the
   * compiler point at each one.
   */
  customerPhone: string | null;
  /** GRW-219 — what the move sheet asks the availability endpoint about. NULL once the service has been deleted: the booking keeps its own name and price. */
  serviceId: string | null;
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
  /** Jira GRW-222 — the branch this visit is at. Optional so an older API does not break the list. */
  locationId?: string;
  /** Jira GRW-405 — booked ahead, not a walk-in recorded as it happened. Optional for an older API. */
  bookedAhead?: boolean;
}

export interface SettingsSummary {
  /** Jira GRW-230 — the business defaults (`locationId` null) or one branch, and the keys that branch has its own value for. */
  scope: { locationId: string | null; ownKeys: string[] };
  tenant: {
    id: string;
    name: string;
    timezone: string;
    phone: string;
    description: string;
    logoUrl: string | null;
  };
  location: { id: string; name: string; timezone: string | null; addressLine1: string; addressCity: string } | null;
  /** Jira GRW-227 — active branches; more than one shows Settings › Branches. */
  branchCount: number;
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
    /** Jira GRW-248 — closed days at this scope (a branch: its own). */
    closedDates?: string[];
    /** Jira GRW-248 — the business's closed days, which close every branch. */
    businessClosedDates?: string[];
  };
  /** GRW-197 — report tabs granted per limited role; `{}` means none. */
  reportAccess: Record<string, string[]>;
  reminderRules: Array<{ ruleKey: string; offsetMin: number; template: string }>;
  workingHours: Array<{ weekday: number; startTime: string; endTime: string }>;
}

export interface ActivityEvent {
  id: string;
  topic: 'appointment.confirmed' | 'appointment.cancelled' | 'appointment.rescheduled' | 'billing.change_pending' | 'conversation.handoff';
  createdAt: string;
  /** Booking topics only — null for `billing.change_pending`. */
  customerName: string | null;
  /** Jira GRW-477 — where the booking is; shown on "All branches". Null for billing rows. */
  branchName: string | null;
  startAt: string | null;
  serviceNames: string[] | null;
  /** Jira GRW-301 — `billing.change_pending` only. */
  billing: { currency: string; currentMonthlyMinor: number; nextMonthlyMinor: number; effectiveFrom: string; openBranches: number } | null;
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
  /** The chain's first service, with the WHOLE chain's duration (GRW-199). */
  service: { id: string; name: string; durationMin: number };
  /** Every service in the chain, in running order. Absent on older callers. */
  services?: Array<{ id: string; name: string; durationMin: number }>;
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
  /** Jira GRW-381 — the one branch this offer runs at. */
  locationId?: string;
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
  /** Jira GRW-381 — the branch it runs at (create only); absent is the branch of its services, else the main one. */
  locationId?: string;
  /** Jira GRW-381 — also publish a copy at every other branch whose menu has its services (create only). */
  allBranches?: boolean;
  title: string;
  description?: string | null;
  active?: boolean;
  serviceIds?: string[];
  comboPriceMinor?: number | null;
  visibleWeekdays?: number[] | null;
  visibleFrom?: string | null;
  visibleUntil?: string | null;
}

/** Jira GRW-381 — a created offer, and with "all branches", where its copies went and which branches were skipped. */
export interface CreatedOffer extends Offer {
  published?: Array<{ locationId: string; name: string; offerId: string }>;
  skipped?: Array<{ locationId: string; name: string; missing: string[] }>;
}

export interface Customer {
  id: string;
  name: string | null;
  /** GRW-199 — NULL for a client recorded at the desk who gave no number. */
  waPhone: string | null;
  /** Jira GRW-392 — the branch this client belongs to. Optional so an older API does not break the list. */
  locationId?: string;
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
  // GRW-199 — a client may have no number; both shapes below carry that.
  // Jira GRW-393 — `branchName`: the same person can be a client of two branches.
  customers: Array<{ id: string; name: string | null; phone: string | null; visitCount: number; locationId: string; branchName: string }>;
  bookings: Array<{
    id: string;
    startAt: string;
    status: AppointmentStatus;
    locationId: string;
    branchName: string;
    customerName: string | null;
    customerPhone: string | null;
    serviceName: string;
    providerName: string | null;
    createdVia: 'whatsapp' | 'dashboard';
    reminderSent: boolean;
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
  /** Jira GRW-314 — set on every service of a combo added at the till: saved as that combo's legs. */
  offerId?: string;
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
  /**
   * Jira GRW-559 — their photo, or null for the lettered tile.
   *
   * OPTIONAL on purpose, unlike the staff screen's copy. These two shapes are read by
   * screens the desk uses all day, and the API may be a deploy behind the dashboard —
   * an absent field has to draw initials, not crash a till.
   */
  photoUrl?: string | null;
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
  /** Jira GRW-230 — staff whose branch has its own grace; anyone absent uses `lateGraceMin`. */
  lateGraceByProvider?: Record<string, number>;
  rows: AttendanceRow[];
}


/** GRW-198 — one chair as the receptionist sees it right now. */
export interface ChairNow {
  schedulableId: string;
  displayName: string;
  free: boolean;
  occupant: {
    appointmentId: string;
    customerName: string | null;
    serviceName: string;
    startedMinAgo: number;
    freesAt: string;
    /** Started, still confirmed, past the grace period — so "they never turned up" is sayable. */
    couldBeANoShow: boolean;
  } | null;
}

export interface ChairsNow {
  chairs: ChairNow[];
  /** Minutes after a booking starts before it may be called a no-show. */
  graceMin: number;
}

/** Jira GRW-216 — one stylist's own takings, when the owner has chosen to show them. */
export interface EarningsSlice {
  bookings: number;
  /** Minor units as a string: this is somebody's pay and must not round through a float. */
  revenueMinor: string;
}

export interface MyEarnings {
  today: EarningsSlice;
  thisMonth: EarningsSlice;
}


/** Jira GRW-246 — what closing a branch does to the bill (GRW-240's preview). Amounts include tax (Jira GRW-255). */
export type BranchClosePreview =
  | { subscription: false }
  | {
      subscription: true;
      currency: string;
      openBranchesBefore: number;
      openBranchesAfter: number;
      monthlyBeforeMinor: number;
      monthlyAfterMinor: number;
      differenceMinor: number;
      effectiveFrom: string;
      mandateReapprovalNeeded: boolean;
    };

/** Jira GRW-243 — Settings › Billing (owner only). Money in minor units, plan amounts — no GST on owner screens (2026-09-14). */
export interface OwnerBilling {
  subscription: null | {
    planName: string;
    status: string;
    currency: string;
    planPriceMinor: number;
    branches: Array<{ id: string; name: string; included: boolean; amountMinor: number }>;
    discount: null | { amountMinor: number; reason: string | null; endsAt: string | null };
    nextBill: { date: string; amountMinor: number };
    /**
     * Jira GRW-241 — `autopay` outranks `online_link`: a live mandate is not asked to pay a link.
     * Jira GRW-413 — `autopay_halted`: AutoPay exists and has stopped collecting, so the screen
     * asks for a re-approval or a payment rather than saying the bill is collected on its own.
     */
    paidBy: 'autopay' | 'autopay_halted' | 'online_link' | 'offline';
    /** The standing permission, or null when there has never been one — which is not the same as `cancelled`. */
    autopay: null | {
      status: 'pending' | 'active' | 'paused' | 'cancelled' | 'failed';
      amountMinor: number | null;
      approvedAt: string | null;
      /** Present only while `pending`: the page where the owner finishes approving. */
      approvalUrl: string | null;
    };
    /** Jira GRW-242 — the next bill is not what AutoPay takes: `up` is asked (with a date), `down` only offered. */
    autopayRenewal: AutopayRenewal | null;
    pendingChange: null | { currency: string; currentMonthlyMinor: number; nextMonthlyMinor: number; effectiveFrom: string; openBranches: number };
  };
  invoices: Array<{ id: string; invoiceNumber: string; periodStart: string; periodEnd: string; amountMinor: number; paymentStatus: string; unpaid: boolean }>;
  due: null | {
    invoiceNumber: string;
    /** Still owed on the oldest unpaid bill, the one Pay now settles (Jira GRW-556 follow-up). */
    amountMinor: number;
    currency: string;
    periodStart: string;
    billsOwed: number;
    totalOwedMinor: number;
  };
  /** Who to ring when there is no Pay now button — paying is online, and this is what a business not switched on for it is given. */
  payHow?: { supportPhone?: string };
  /** The newest payment received in the last week, so the owner is told it arrived. Null when none. */
  lastPayment?: { amountMinor: number; currency: string; paidOn: string } | null;
  /** Jira GRW-407 — money received that no bill has taken yet; taken off the next one. */
  onAccountMinor?: number;
}

/** Jira GRW-241 — what starting UPI AutoPay hands back: a page to approve on, never a permission already given. */
export interface AutopayStart {
  approvalUrl: string;
  amountMinor: number;
  currency: string;
  /** True when this is the page from an earlier, unfinished attempt rather than a new mandate. */
  resumed: boolean;
  /** Jira GRW-242 — true when this approves a NEW amount for AutoPay that is already on. */
  renewal?: boolean;
}

/**
 * Jira GRW-242 — the next bill is not what AutoPay takes. Money in minor units.
 * `stage` is how close the billing date is: `early` (more than a week), `week`,
 * `soon` (3 days or fewer), `last` (the last day).
 */
export interface AutopayRenewal {
  direction: 'up' | 'down';
  fromAmountMinor: number;
  toAmountMinor: number;
  currency: string;
  dueDate: string;
  daysLeft: number;
  stage: 'early' | 'week' | 'soon' | 'last';
  /** The bill just raised was only part-paid by AutoPay, because the new amount was not approved in time. */
  missedLastBill: boolean;
  /** The page to finish approving on, once they have started; otherwise null. */
  approvalUrl: string | null;
}

/** Jira GRW-254 — the owner's bills: plan amounts only, no tax fields. */
export interface OwnerBillRow {
  id: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  amountMinor: number;
  currency: string;
  paymentStatus: string;
  unpaid: boolean;
}
export interface OwnerBillPage {
  bills: OwnerBillRow[];
  page: number;
  pageSize: number;
  total: number;
}
export interface OwnerBill extends Omit<OwnerBillRow, never> {
  issuedAt: string;
  planCode: string;
  planName: string | null;
  planPriceMinor: number;
  extraBranches: number;
  branchAddonMinor: number;
  branchAmountMinor: number;
  discountAmountMinor: number;
  /** Jira GRW-407 — the payments put against this bill. */
  payments?: Array<{ amountMinor: number; refundedMinor: number; via: 'autopay' | 'pay_now' | 'recorded'; paidOn: string | null; fromAccount: boolean }>;
}

/** One correction the owner made to a finished booking — what a service was, and what it is now. */
export interface BookingCorrection {
  at: string;
  reason: string | null;
  changes: Array<{
    appointmentId: string;
    beforeService: string | null;
    afterService: string | null;
    beforeMinor: number | null;
    afterMinor: number;
  }>;
}
