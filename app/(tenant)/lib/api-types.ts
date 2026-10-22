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
  tenant: { id: string; name: string; timezone: string; locationName: string | null; /** The main branch (Jira GRW-582 perf) — the API has always sent it. */ locationId?: string | null; branchCount?: number; status?: string; productReturnWindowDays?: number } | null;
  /**
   * Jira GRW-235 — open branches, main first.
   *
   * `paymentQrUrl` is the EFFECTIVE QR for that branch — its own, else the
   * business's, resolved by the API. Absent for a stylist (who does not hold
   * the salon's QR up to a customer) and from an API a deploy behind, which is
   * why the till treats it as "no QR" rather than as an error.
   */
  branches?: Array<{ id: string; name: string; paymentQrUrl?: string | null }>;
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
  /** Jira GRW-608 — which set of screens this business runs, from its vertical: `diary` (a salon's) or `shop`. Absent reads as the diary. */
  surface?: 'diary' | 'shop';
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
    /** The name they go by — their own, else their stylist profile's. Null until set (or from an older API). */
    name?: string | null;
    /** Jira GRW-74 — the role they hold, if any; the grid below applies only to a member who has one. */
    tenantRoleId?: string | null;
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
  /** Jira GRW-74 — the pages the signed-in member's role grants, by level. Meaningful for a member who holds a role (`member.tenantRoleId`). */
  permissions?: Record<string, 'none' | 'view' | 'manage'>;
  reportTabs?: string[];
  /**
   * Jira GRW-90 · GRW-137 — a platform admin is looking at this account.
   *
   * Null on every ordinary session, which is what keeps the banner off an
   * owner's own dashboard entirely.
   */
  impersonation: { businessName: string; role: string } | null;
  /**
   * Jira GRW-564 — how this person reaches a human, for the help screen.
   *
   * Every role gets it. The number used to arrive only on `OwnerBilling`, so
   * a receptionist or a stylist had none anywhere in the product. Optional
   * because an API a deploy behind sends nothing, and the screen must render
   * without it rather than crash.
   */
  /**
   * Jira GRW-564 — how to reach support. `options` (added later) is the list the help screen shows, each with
   * its own number to ring and its own number to message; `phone` / `whatsapp` are kept for what predates it.
   * Absent from an older API, which the help screen reads as one option made of `phone` and `whatsapp`.
   */
  support?: { phone?: string; whatsapp?: string; options?: { phone?: string; whatsapp?: string }[] };

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
  /**
   * Jira GRW-563 — `pending`: marks waiting for a Yes / No at the branches this person sees (0 for a stylist).
   * `selfCheckIn`: whether a stylist's own branch offers phone check-in. Optional: the API may be a deploy behind.
   */
  attendance?: { pending: number; selfCheckIn: boolean };
  capabilities: {
    walkIn: boolean;
    /** GRW-219 — may a booking be moved to another time. Read by `BookingSheet`. */
    reschedule: boolean;
    richAnalytics: boolean;
    staffLeaderboard: boolean;
    /** Owner, 2026-10-14 — `catalog.products`: whether this business sells things over the counter. Absent reads as yes. */
    products?: boolean;
    /** Jira GRW-607 — whether the business takes bookings, and whether it sells services. Absent reads as yes: only an explicit false takes a diary area away. */
    bookings?: boolean;
    services?: boolean;
    /** Jira GRW-598 — whether sizes are switched on for this business (the `sizes` flag). Absent reads as no: it ships off. */
    sizes?: boolean;
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

/**
 * Owner, 2026-10-14 — something the till sells that nobody performs: a shampoo, a serum. At one branch, with a
 * stock count the till takes from (it may go below zero — the bottle in the hand is the truth; the owner puts
 * the number right). `sold` is how many have gone over the counter, ever.
 */
export interface Product {
  id: string;
  name: string;
  priceMinor: string;
  currency: string;
  stock: number;
  imageUrl: string | null;
  active: boolean;
  locationId: string;
  sold: number;
  /** 0116 — what the business pays for one, for the margin. Null until the owner says. */
  costMinor: string | null;
  /** The screen flags the product once the count is at or below this; 0 = never. */
  lowStockAt: number;
  /** 0117 — the shelf's own category. Null for none. */
  categoryId: string | null;
  categoryName: string | null;
  /** Jira GRW-574 (0119) — the business's own code and what a scanner reads off the product. Null until said. */
  sku: string | null;
  barcode: string | null;
  /** Jira GRW-574 (0120) — optional GST rate in basis points (0..2800; 0 is 0%, null is not set) and HSN code. */
  gstRateBp: number | null;
  hsn: string | null;
  /** Jira GRW-595 — the options this product is sold in, in the owner's order ("Size", "Colour"). Empty for a product with no sizes. Absent on an API a deploy behind. */
  optionAxes?: SizeAxis[];
  /** How many sizes it has. For a product with sizes, `stock` is their total. */
  variantCount?: number;
  /**
   * Jira GRW-599 — on the till's list only, and only for a product with sizes: every live, active size in the owner's
   * order with its count, price and codes, so tapping a product never costs a request to learn its sizes.
   */
  sizes?: TillSize[];
}

/** Jira GRW-599 — one size as the till holds it. `priceMinor` null = the product's own price. */
export interface TillSize {
  id: string;
  option1: string;
  option2: string | null;
  priceMinor: string | null;
  sku: string | null;
  barcode: string | null;
  stock: number;
}

/** Jira GRW-595 — one option of a product and its values, in the owner's order. */
export interface SizeAxis {
  name: string;
  values: string[];
}

/** Jira GRW-595–597 — one size of a product: a combination of its options, with its own count, price and codes. */
export interface Size {
  id: string;
  productId: string;
  option1: string;
  option2: string | null;
  /** Null = the product's own price. */
  priceMinor: string | null;
  sku: string | null;
  barcode: string | null;
  active: boolean;
  stock: number;
}

/** Jira GRW-598 — a product's options and every size on it, with the token the next save sends back. */
export interface ProductSizes {
  /** Whose sizes these are. */
  product: { id: string; name: string; priceMinor: string };
  axes: SizeAxis[];
  variants: Size[];
  version: string;
}

/** Jira GRW-598 — one cell of the grid as the server takes it. What a cell leaves out is left alone; what it sends as null is cleared. */
export interface SizeGridCell {
  option1: string;
  option2?: string | null;
  stock?: number;
  priceMinor?: number | null;
  sku?: string | null;
  barcode?: string | null;
  active?: boolean;
}

/** Owner, 2026-10-18 — one row of a product list on its way onto the shelf. An update carries only the fields the file filled, and never the count. */
export interface ProductImportItem {
  mode: 'create' | 'update';
  /** Its number in the owner's file — what a refusal names. */
  row?: number;
  existingId?: string;
  /** An update only: units that arrived. Added to the count and written to its history as received. */
  addStock?: number;
  name?: string;
  priceMinor?: number;
  stock?: number;
  costMinor?: number;
  lowStockAt?: number;
  categoryName?: string;
  sku?: string;
  barcode?: string;
  gstRateBp?: number;
  hsn?: string;
}

export interface ProductImportResult {
  created: number;
  updated: number;
  /** Products whose count went up, and the units added in all. */
  stockAdded: number;
  unitsAdded: number;
  categoriesCreated: number;
  /** The categories the file made, so the owner sees what appeared on their shelf. */
  categoryNames: string[];
}

/** 0117 — a shelf of the shelf: the owner's own grouping at one branch, with how many live products it holds. */
export interface ProductCategory {
  id: string;
  name: string;
  sortOrder: number;
  locationId: string;
  count: number;
}

/** The Sales part of the product sheet: the last `days` days from the bills' own lines. */
export interface ProductSales {
  days: number;
  qty: number;
  moneyMinor: number;
  byDay: { day: string; qty: number; moneyMinor: number }[];
}

export interface ProductInput {
  name: string;
  priceMinor: number;
  categoryId?: string | null;
  /** On create, the opening count. On an edit the API turns it into an `adjusted` ledger line. */
  stock?: number;
  active?: boolean;
  costMinor?: number | null;
  lowStockAt?: number;
  /** 0119 — null clears it; one live, active product per branch may hold each. */
  sku?: string | null;
  barcode?: string | null;
  /** 0120 — null clears it; 0 is 0% GST (kept apart from null). */
  gstRateBp?: number | null;
  hsn?: string | null;
}

/** 0116 · 0122 — why a product's count changed. */
export type MovementKind = 'received' | 'sold' | 'adjusted' | 'damaged' | 'used' | 'returned' | 'transfer_out' | 'transfer_in' | 'exchange';
export type ManualMovementKind = Exclude<MovementKind, 'sold' | 'transfer_out' | 'transfer_in' | 'exchange'>;

export interface StockMovement {
  id: string;
  kind: MovementKind;
  /** Signed: what was added to the count. */
  qty: number;
  stockAfter: number;
  note: string | null;
  byName: string | null;
  visitKey: string | null;
  /** 0122 — pairs `transfer_out` at the sending branch with `transfer_in` at the receiving branch. */
  transferId?: string | null;
  /** 0123 — ties the `adjusted` lines written by one stock take pass. */
  stockTakeId?: string | null;
  createdAt: string;
}

/** Jira GRW-602 (0134) — what an owner typed into a stock take and has not committed: typed text by product and by size. `updatedAt` is null when no walk has been started. */
export interface StockTakeDraft {
  products: Record<string, string>;
  sizes: Record<string, string>;
  updatedAt: string | null;
}

/** 0123 — what saving a stock take pass hands back. */
export interface StockTakeResult {
  stockTakeId: string;
  adjusted: number;
  products: Product[];
}

/** A catalogue row as the Services screen edits it — Service plus the fields booking flows never need. */
export interface ServiceAdmin extends Service {
  categoryId: string | null;
  active: boolean;
  /** Owner, 2026-10-15 — a sentence or two about the service; null when never written. */
  description?: string | null;
  /**
   * Jira GRW-482 — how many of this branch's stylists can perform it.
   *
   * Zero means it is on the menu and bookable by nobody. Optional because an older
   * API will not send it, and a missing count must not be read as a warning.
   */
  providerCount?: number;
  /** Jira GRW-582 — GST rate in basis points (1800 = 18%); null is "not set", which is not 0%. Optional for an older API. */
  gstRateBp?: number | null;
  /** Jira GRW-582 — the service's SAC, 4 to 8 digits; null until entered. */
  sac?: string | null;
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
  description?: string | null;
  /** A picture picked from the pack, or null to go back to matching on the name. Update only. */
  catalogKey?: string | null;
  /** Jira GRW-582 — tax details, both optional; null clears. */
  gstRateBp?: number | null;
  sac?: string | null;
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
  /**
   * Owner-app audit, 2026-10-10 — set on a booking a move retired: where it is NOW (the last move's new start).
   * The row itself reads `cancelled`; this is what makes it "Moved" on the list instead.
   */
  movedTo?: string | null;
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
  /** Jira GRW-581 — products sold on this visit (`visit_product`). */
  products?: VisitProductLine[];
  /** Jira GRW-581 — split payment lines for this visit (`visit_payment`). */
  payments?: VisitPaymentLine[];
  /** Product returns on this visit and how each was paid out (`product_return`); absent from an API that predates it. */
  refunds?: VisitPaymentLine[];
}

export interface VisitProductLine {
  id?: string;
  productId: string | null;
  /** Jira GRW-603 — the size this line sold; absent or null for a product with no sizes. */
  variantId?: string | null;
  name: string;
  priceMinor: string;
  qty: number;
  returnedQty?: number;
  paidMinor: string;
  returnedMinor?: string;
  sku?: string | null;
  barcode?: string | null;
}

export interface ReturnSaleProductsResponse {
  visitKey: string;
  refundMinor: number;
  /** How the money went back — cash out of the drawer, or UPI/card sent back. */
  refundMode: 'cash' | 'card' | 'upi' | 'other';
  /** The issued document this return leaves uncorrected, when the desk went ahead past the warning. */
  documentNumber: string | null;
  /** True when this answers a request already made (a retry): nothing new was returned. */
  replayed: boolean;
  restocked: boolean;
  items: Array<{
    productId: string;
    name: string;
    qty: number;
    refundMinor: number;
    restocked: boolean;
    stockAfter: number | null;
    /** Jira GRW-636 — the size was removed since the sale: the unit was counted on its own (retired) row, and the owner is told. */
    sizeRemoved?: boolean;
  }>;
}

export interface VisitPaymentLine {
  mode: string;
  amountMinor: string;
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
    /** 0127 — days after a sale during which a product may be returned (0 = day of sale only). */
    productReturnWindowDays?: number;
    /** Jira GRW-248 — closed days at this scope (a branch: its own). */
    closedDates?: string[];
    /** Jira GRW-248 — the business's closed days, which close every branch. */
    businessClosedDates?: string[];
  };
  /**
   * Jira GRW-582 — what a business needs on file to give a customer a GST document.
   *
   * `status` is `unregistered` until an owner says otherwise, which is most businesses. The three `branch*` fields
   * belong to the branch this Settings is scoped to, because a business registered in two states holds one
   * registration per state.
   */
  gst: {
    status: 'regular' | 'composition' | 'unregistered';
    gstin: string;
    legalName: string;
    registeredAddress: string;
    invoicePrefix: string;
    invoiceFooter: string;
    pricesIncludeTax: boolean;
    branchState: string;
    branchStateCode: string;
    branchGstin: string;
  };
  /** GRW-197 — report tabs granted per limited role; `{}` means none. */
  reportAccess: Record<string, string[]>;
  reminderRules: Array<{ ruleKey: string; offsetMin: number; template: string }>;
  workingHours: Array<{ weekday: number; startTime: string; endTime: string }>;
}

export type ActivityTopic =
  | 'appointment.confirmed'
  | 'appointment.cancelled'
  | 'appointment.rescheduled'
  | 'appointment.walk_in'
  | 'appointment.completed'
  | 'appointment.no_show'
  | 'billing.change_pending'
  | 'billing.invoice'
  | 'billing.payment'
  | 'billing.status'
  | 'billing.discount'
  | 'billing.autopay_halted'
  | 'conversation.handoff'
  // A stylist marked themselves in from their phone — verified, or waiting for a yes or no.
  | 'attendance.in'
  | 'attendance.out'
  | 'attendance.pending'
  | 'attendance.out_pending';

/** Jira GRW-562 — the billing half of a feed row, by topic; `change_pending` keeps GRW-301's shape. */
export type ActivityBilling =
  | { currency: string; currentMonthlyMinor: number; nextMonthlyMinor: number; effectiveFrom: string; openBranches: number }
  | { invoiceNumber: string; totalMinor: number; currency: string; periodStart: string; periodEnd: string }
  | { amountMinor: number; currency: string }
  | { status: string }
  | { discountAmountMinor: number; currency: string }
  | { mandateStatus: string };

export interface ActivityEvent {
  /** Jira GRW-562 — the row's creation time in epoch ms: monotonic across every source, which the read cursor needs. */
  id: string;
  topic: ActivityTopic;
  createdAt: string;
  /** Booking topics only — null for a billing row. */
  customerName: string | null;
  /** Jira GRW-477 — where the booking is; shown on "All branches". Null for billing rows. */
  branchName: string | null;
  startAt: string | null;
  serviceNames: string[] | null;
  /**
   * Jira GRW-562 — the booking behind the row, so tapping it opens that booking rather than the day it
   * falls on. The earliest leg, the one `startAt` reports, so the id and the time name the same visit.
   * Null for billing and handoff rows — and absent from an API older than this field, which is why the
   * dashboard falls back to the day (NotificationBell's `notifHref`) instead of refusing to link.
   */
  appointmentId?: string | null;
  billing: ActivityBilling | null;
  /** Jira GRW-562 — who at the salon did it (a stylist's name), for a dashboard action; null for WhatsApp and billing. */
  actorName: string | null;
  actorRole: 'owner' | 'manager' | 'staff' | 'receptionist' | null;
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
  /*
   * Jira GRW-563 — phone check-in. All OPTIONAL for the same reason `photoUrl` is: the API may be a deploy behind.
   * `approval`: auto (verified, or from the register), pending (self-marked, the phone could not place her),
   * approved, rejected. `id` is the row's, for the Yes / No route.
   */
  id?: string | null;
  approval?: 'auto' | 'pending' | 'approved' | 'rejected' | null;
  source?: 'register' | 'self' | 'self_unverified' | null;
  inDistanceM?: number | null;
  inAccuracyM?: number | null;
  outDistanceM?: number | null;
  rejectReason?: 'not_at_branch' | 'wrong_time' | 'other' | null;
}

/** Jira GRW-563 — one mark waiting for the owner's Yes or No. */
export interface PendingAttendanceRow {
  id: string;
  providerId: string;
  displayName: string;
  photoUrl: string | null;
  locationId: string;
  onDate: string;
  inAt: string | null;
  outAt: string | null;
  inDistanceM: number | null;
  inAccuracyM: number | null;
  outDistanceM: number | null;
  markedAt: string;
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
  /**
   * Jira GRW-563 — a row this viewer writes will be measured against the branch's fence, so the register has
   * to send the phone's fix with it or the row lands in the owner's queue. True only for a branch's own desk
   * at a branch with the pin set and the switch on; an owner is never fenced. Absent from an older API, which
   * reads as false — the same rows, approved as they always were.
   */
  fenceApplies?: boolean;
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
    /** What this period costs — the plan price and branches less today's discount. The plan card's own total. */
    monthlyMinor?: number;
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

/**
 * Jira GRW-609 — a shop's Home, from one read. The money keys (`takingsMinor`) are ABSENT for the front desk: the API
 * omits them, the screen does not hide them.
 */
export interface ShopHome {
  timezone: string;
  today: { orders: number; takingsMinor?: number };
  yesterday: { orders: number; takingsMinor?: number };
  /** Has the shop ever sold anything. False: Home invites the first order. */
  anyOrders: boolean;
  /** Jira GRW-614 — orders still to send (new or packed). Home's count of what is waiting, linking into the filtered list. */
  toSend: number;
  running: {
    /** Has the shelf ever been counted. False: Home says so instead of listing zeros. */
    counted: boolean;
    /** Everything at or under its line — the "View all (n)" beside the few listed. */
    total: number;
    items: Array<{ productId: string; name: string; /** "30" or "30 / White"; null for a product with no sizes. */ size: string | null; left: number }>;
  };
}

/**
 * Jira GRW-614 — one row of the Orders list. Money (`amountMinor`) is ABSENT, not zero, for a front desk the owner has
 * not opened the sales tab to: the API omits the key, so this screen has nothing to hide.
 */
export interface OrderListRow {
  id: string;
  /** The short code the row shows and the search finds. */
  code: string;
  soldAt: string;
  channel: string;
  status: string;
  /** False for a state this build has never heard of: shown as the data spells it, never crashing the list. */
  known: boolean;
  externalRef: string | null;
  locationId: string;
  /** The client if it has one, else the buyer. */
  who: { kind: 'client' | 'buyer'; name: string | null } | null;
  items: number;
  amountMinor?: number;
  /** Jira GRW-625 — the marketplace has not yet accepted what the shop told it (sent, cancelled): a glance finds these. */
  marketplaceUnconfirmed?: boolean;
}

export interface OrdersPage {
  rows: OrderListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Jira GRW-615 — one thing that happened to an order after it was placed. Says THAT, never what (no buyer value). */
export interface OrderHistoryEntry {
  kind: 'status_change' | 'client_attached' | 'buyer_erased' | 'exchange';
  at: string;
  from: string | null;
  to: string | null;
  by: string | null;
}

/**
 * Jira GRW-615 — an order's own screen, from ONE read. Every price, payment and total is ABSENT (not zero) for a front
 * desk the owner has not opened the sales tab to: the API omits the keys, so this screen has nothing to hide.
 *
 * `moves` is what the screen may offer, computed by the API from the state machine and sent with the order — the screen
 * never decides what can follow what (BR-01), and an older `@growza-app/shared` cannot make it offer a move the API
 * would refuse.
 */
/**
 * Jira GRW-625 — what the shop told the marketplace about an order, and whether it was taken. `pending` is "not told yet" (waiting, or
 * trying again); `stuck` is "tried and could not, needs a person"; `refused` is the marketplace's own answer, with a reason from a closed set.
 */
export interface OrderMarketplaceMessage {
  kind: 'dispatch' | 'cancel';
  state: 'pending' | 'accepted' | 'refused';
  stuck: boolean;
  /** When it was accepted; null until then. */
  at: string | null;
  reason: 'order_cancelled' | 'order_unknown' | 'not_allowed' | 'other' | null;
}

export interface OrderDetail {
  id: string;
  locationId: string;
  /** Jira GRW-641 — the branch the order is booked against, by name. */
  branchName: string | null;
  status: string;
  known: boolean;
  channel: string;
  externalRef: string | null;
  soldAt: string;
  buyer: { name: string | null; contact: string | null; address: string | null } | null;
  buyerRedactedAt: string | null;
  client: { id: string; name: string | null } | null;
  lines: Array<{
    id: string;
    productId: string | null;
    variantId: string | null;
    name: string;
    qty: number;
    returnedQty: number;
    /** Jira GRW-617 — the line this one replaced in a size swap, or null. */
    swappedFromId: string | null;
    /** How many of this line's units were swapped for another size (counted in `returnedQty`, but nothing was refunded for them). */
    swappedQty: number;
    /** Can a swap start from this line? Decided by the server. */
    swappable: boolean;
    sku: string | null;
    barcode: string | null;
    priceMinor?: string;
    paidMinor?: string;
    returnedMinor?: string;
  }>;
  /** Jira GRW-617 — may this viewer swap a size? Decided by the server with the function that would refuse the swap. */
  canSwap: boolean;
  /** Jira GRW-625 — what the marketplace was told about this order. Empty for a counter sale. */
  marketplace?: OrderMarketplaceMessage[];
  /** May this viewer ask for a message to be sent again? Decided by the server with the route's own role check. */
  canRetryMarketplace?: boolean;
  history: OrderHistoryEntry[];
  /** Jira GRW-635 — the returns recorded against the order, each with its reason; a parcel that came back undelivered is its own kind. */
  returns?: OrderReturn[];
  /** Jira GRW-637 — the refunds recorded against it (money: empty for a viewer who may not see money). */
  refunds?: OrderRefund[];
  moves: { primary: string | null; more: string[] };
  payments?: Array<{ mode: string; amountMinor: number }>;
  totalMinor?: number;
  refundedMinor?: number;
}

/** The answer to a move that was refused because the order is no longer where the screen thought. */
export interface OrderMoveRefusal {
  error: string;
  detail: string;
  status?: string;
  allowed?: string[];
}

/** Jira GRW-617 — what a size swap sends. The quote takes the same body and writes nothing. */
export interface ExchangeBody {
  lineId: string;
  toVariantId: string;
  qty?: number;
  /** How a non-zero difference was paid, or given back. */
  settlementMode?: 'cash' | 'card' | 'upi' | 'other';
  /** The difference the screen showed; the server refuses the swap, with the amount it is now, if that is no longer true. */
  expectedDifferenceMinor?: number;
  idempotencyKey?: string;
  acknowledgeIssuedDocument?: boolean;
  overrideReturnWindow?: boolean;
}

/** Jira GRW-617 — a swap, or the quote of one. `differenceMinor` is new less old: positive is taken, negative is given back. */
export interface ExchangeResult {
  exchangeId: string;
  fromLineId: string;
  toLineId: string;
  fromName: string;
  toName: string;
  qty: number;
  newUnitMinor: number;
  oldPaidMinor: number;
  differenceMinor: number;
  settlementMode: string | null;
  replayed: boolean;
}

/** Jira GRW-618 — a marketplace's own code, and the one size (or product with no sizes) it points at. */
export interface MarketplaceCode {
  id: string;
  channel: 'flipkart' | 'amazon';
  code: string;
  productId: string;
  variantId: string | null;
  /** "School Shirt (30 / White)" — what it points at, by the names the owner gave. */
  label: string;
  productName: string;
  size: string | null;
  /** The size was retired after the code was mapped: the listing points at something that is not on sale. */
  retired: boolean;
}

export interface MarketplaceCodesPage {
  rows: MarketplaceCode[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaveCodesBody {
  channel: 'flipkart' | 'amazon';
  productId?: string;
  rows: Array<{ code: string; size?: string; variantId?: string; productId?: string }>;
  /** True to repoint a code that is already mapped elsewhere instead of being refused. */
  replace?: boolean;
}

export interface SaveCodesResult {
  created: number;
  updated: number;
  unchanged: number;
  /** Jira GRW-620 — the orders that were waiting on these codes and became real orders. */
  released?: ReleaseResult;
}

/** Jira GRW-619 — what importing an order report did, in plain counts. */
export interface ImportSummary {
  importId: string;
  channel: 'flipkart' | 'amazon';
  /** Orders that became real orders. */
  created: number;
  /** Orders already in Growza from an earlier import: nothing changed for them. */
  alreadyThere: number;
  /** Orders waiting for a size: a line's code is not mapped yet. */
  held: number;
  /** Units the shelf did not have (the count was taken to zero). */
  shortUnits: number;
  lines: { created: number; alreadyThere: number; held: number };
  heldCodes: Array<{ code: string; lines: number; reason: 'unmapped' | 'retired' }>;
  /** Rows that could not be read, by their row in the file (the heading is row 1). */
  problems: Array<{ row: number; why: string }>;
  replayed: boolean;
}

/** Jira GRW-620 — one code holding marketplace orders back: what is waiting on it, and why. */
export interface HeldCode {
  channel: 'flipkart' | 'amazon';
  code: string;
  lines: number;
  orders: number;
  units: number;
  nameInReport: string | null;
  since: string;
  fileName: string | null;
  /** 'unmapped': no size yet. 'retired': mapped to a size no longer sold. 'ready': mapped to a size on sale — the release has just not run. */
  reason: 'unmapped' | 'retired' | 'ready';
  mappedTo: string | null;
}
export interface HeldPage {
  rows: HeldCode[];
  total: number;
  /** Orders waiting in all, for the headline. */
  orders: number;
  page: number;
  pageSize: number;
}
export interface ReleaseResult {
  orders: number;
  lines: number;
  shortUnits: number;
  stillHeld: number;
}
/** A size (or a product with no sizes) a code could be mapped to. */
export interface SizeToMap {
  productId: string;
  variantId: string | null;
  productName: string;
  size: string | null;
  label: string;
}

/** Jira GRW-641 — which branch a marketplace sells from. */
export interface ChannelBranch {
  channel: 'flipkart' | 'amazon';
  /** The branch it sells from now; null when the one chosen has been closed. */
  locationId: string | null;
  branchName: string | null;
  /** 'chosen' by the owner, or the 'default' main open branch. */
  source: 'chosen' | 'default';
  gone: boolean;
  /** More than one branch to choose between: a one-branch shop sees its branch and cannot change it. */
  changeable: boolean;
}
export interface ChannelBranches {
  channels: ChannelBranch[];
  branches: Array<{ id: string; name: string }>;
}
export interface SetChannelBranchResult {
  channel: 'flipkart' | 'amazon';
  locationId: string;
  branchName: string;
  previous: { locationId: string | null; branchName: string | null };
  /** Online orders from this channel not yet dispatched that stay at the old branch. */
  inFlightAtOld: number;
  changed: boolean;
}

/**
 * Jira GRW-621 — a marketplace's seller keys, as the screen may know them: which fields are SET and what the last Check said. Never a
 * value — the API cannot read them back, so neither can this.
 */
export interface ChannelConnection {
  channel: 'flipkart' | 'amazon';
  /** False until the server has an encryption key: then keys cannot be kept at all, and the form is not offered. */
  keysSetUp: boolean;
  saved: boolean;
  savedAt: string | null;
  fields: Array<{ key: string; label: string; secret: boolean; set: boolean }>;
  /** What the marketplace said at the last Check; null = never checked, or the keys were replaced since. */
  lastCheck: { at: string; ok: boolean; reason: 'rejected' | 'unreachable' | null } | null;
  lastUsedAt: string | null;
  /** Whether tapping Check would ask the marketplace anything. False until that marketplace's adapter exists. */
  canCheck: boolean;
  /** Jira GRW-641 — the shop it sells from. */
  branch: { locationId: string | null; name: string | null; source: 'chosen' | 'default'; gone: boolean };
  /** Jira GRW-624 — the buffer kept back, and how stock going out is doing. */
  stock: ChannelStock;
}
/** Jira GRW-624 — stock going out to a marketplace. Counts and times only: never a number per size. */
export interface ChannelStock {
  channel: 'flipkart' | 'amazon';
  /** How many to keep back from online orders. */
  buffer: number;
  lastPushedAt: string | null;
  /** Why the last run could not finish; null = it finished, or none ran. */
  lastRunReason: 'rate_limited' | 'unreachable' | 'refused' | 'keys_unreadable' | 'failed' | null;
  waiting: number;
  stuck: number;
}
/** Jira GRW-623 — one marketplace's orders coming in: when they last did, why not if they could not, what waits. */
export interface ChannelOrdersLine {
  channel: 'flipkart' | 'amazon';
  /** Anything is asked of the marketplace at all: false until its adapter exists, and the screen then says nothing. */
  canPull: boolean;
  /** The marketplace turned the keys down at the last Check: nothing is brought in until they are replaced. */
  keysRejected: boolean;
  lastBroughtInAt: string | null;
  lastRunReason: 'rate_limited' | 'unreachable' | 'refused' | 'keys_unreadable' | 'failed' | null;
  /** Orders the last run could not read or store. */
  lastMalformed: number;
  /** Orders waiting for a code to be matched to a size. */
  held: number;
  /** Orders brought in that the marketplace has not yet been told we have. */
  unacknowledged: number;
}
/** Jira GRW-626 — what is waiting for a marketplace, what failed, and what the owner can do about it. */
export interface ChannelQueueSummary {
  channel: 'flipkart' | 'amazon';
  sizes: { waiting: number; stuck: number };
  messages: { waiting: number; refused: number; stuck: number };
  ordersIn: { lastBroughtInAt: string | null; reason: string | null; unreadable: number };
  keysRejected: boolean;
  /** Sizes and messages waiting on their own backoff after a failure: what Try again can send now. */
  backingOff: number;
  /** Until when the marketplace has asked us to wait, if it has. */
  holdUntil: string | null;
  needsAttention: number;
}
export interface ChannelQueueItem {
  key: string;
  area: 'stock' | 'order';
  kind: 'dispatch' | 'cancel' | null;
  label: string;
  state: 'waiting' | 'stuck' | 'refused';
  /** A short code from a closed set, never the marketplace's own words; the screen puts it in plain language. */
  reason: string | null;
  since: string;
}
export interface ChannelQueuePage {
  summary: ChannelQueueSummary;
  items: ChannelQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}
export interface SetStockBufferResult {
  channel: 'flipkart' | 'amazon';
  buffer: number;
  changed: boolean;
}
export type ChannelCheckResult = { result: 'working' | 'rejected' | 'unreachable' | 'unavailable'; detail: string };
export interface SaveChannelKeysResult {
  saved: true;
  replaced: boolean;
  connection: Omit<ChannelConnection, 'canCheck' | 'branch' | 'stock'>;
}

/** Jira GRW-631 — what is on the shelf, size by size, and what it is worth at cost. */
export interface StockReportSize {
  id: string;
  label: string;
  stock: number;
  costMinor: string | null;
  valueMinor: string | null;
}
export interface StockReportStyle {
  id: string;
  name: string;
  categoryId: string | null;
  branchId: string;
  branchName: string;
  units: number;
  valueMinor: string | null;
  sizesWithoutCost: number;
  sizes: StockReportSize[];
}
export interface StockReportTotals {
  styles: number;
  sizes: number;
  units: number;
  valueMinor: string;
  sizesWithoutCost: number;
  sizesWithCost: number;
  negativeSizes: number;
}
export interface StockReportPage {
  styles: StockReportStyle[];
  totals: StockReportTotals;
  neverCounted: boolean;
  page: number;
  pageSize: number;
}
export interface StockReportQuery {
  location?: string;
  categoryId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Jira GRW-632 — what sells and what sits. */
export type SellersRange = 'last_7_days' | 'this_month' | 'last_month' | 'last_3_months' | 'this_year';
export interface SellersWindow {
  key: string;
  label: string;
  startISO: string;
  endExclusiveISO: string;
}
export interface BestSellerRow {
  id: string;
  productId: string;
  name: string;
  sizeLabel: string | null;
  units: number;
  valueMinor: string;
  lastYearUnits: number | null;
  lastYearValueMinor: string | null;
}
export interface BestSellersPage {
  window: SellersWindow;
  lastYear: { startISO: string; endExclusiveISO: string; hasData: boolean };
  rows: BestSellerRow[];
  totals: { sizes: number; units: number; valueMinor: string };
  page: number;
  pageSize: number;
}
export interface DeadStockRow {
  id: string;
  productId: string;
  name: string;
  sizeLabel: string | null;
  stock: number;
  lastSoldAt: string | null;
  valueMinor: string | null;
}
export interface DeadStockPage {
  window: SellersWindow;
  rows: DeadStockRow[];
  totals: { sizes: number; units: number; valueMinor: string; sizesWithoutCost: number };
  page: number;
  pageSize: number;
}
export interface SellersQuery {
  range: SellersRange;
  location?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

/** Jira GRW-633 — what to order before the season. */
export interface ReorderRow {
  id: string;
  productId: string;
  name: string;
  sizeLabel: string | null;
  branchName: string;
  stock: number;
  soldLastYear: number | null;
  suggested: number | null;
  override: number | null;
  order: number | null;
  soldOutLastYear: boolean;
  /** The days this order has to cover: what the owner's number is kept against. */
  from: string;
  to: string;
  lastYearFrom: string;
  lastYearTo: string;
}
export interface ReorderPage {
  rows: ReorderRow[];
  totals: { sizes: number; toOrder: number; withoutBasis: number; edited: number };
  page: number;
  pageSize: number;
}
export interface ReorderRule {
  categoryId: string;
  name: string;
  leadDays: number | null;
  coverDays: number | null;
  effectiveLeadDays: number;
  effectiveCoverDays: number;
}
export interface ReorderRules {
  defaults: { leadDays: number; coverDays: number };
  rules: ReorderRule[];
}
export interface ReorderQuery {
  location?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

/** Jira GRW-634 — where the money came from, by channel. */
export interface ChannelRow {
  channel: string;
  billedMinor: string;
  orders: number;
  averageMinor: number | null;
  returnedOrders: number;
  cancelledOrders: number;
  /** Jira GRW-637 — what was refunded on this channel's orders in these days, as recorded; NOT taken off the billed amount again. */
  refundedMinor?: string;
  refundedCount?: number;
  previous: { billedMinor: string; orders: number } | null;
  changePct: number | null;
}
export interface ByChannelPage {
  window: { key: string; label: string; startISO: string; endExclusiveISO: string };
  previous: { startISO: string; endExclusiveISO: string; hasData: boolean };
  channels: ChannelRow[];
  totals: { billedMinor: string; orders: number; returnedOrders: number; previousBilledMinor: string | null; changePct: number | null };
  trend: Array<{ label: string; startISO: string; endExclusiveISO: string; billedMinor: Record<string, string> }>;
  anyOrders: boolean;
  caveat: string;
}

/** Jira GRW-635 — a return's reason, from the small set returns are grouped by. */
export type ReturnReason = 'size' | 'not_as_described' | 'faulty' | 'wrong_item' | 'changed_mind' | 'other';
export interface OrderReturn {
  at: string;
  kind: 'customer' | 'undelivered';
  reasonCode: string | null;
  reasonText: string | null;
  units: number;
  restocked: boolean;
  saleableDefaulted: boolean;
}
export interface ReturnsReportPage {
  window: { key: string; label: string; startISO: string; endExclusiveISO: string };
  byReason: Array<{ reason: string; returns: number; units: number }>;
  customer: { returns: number; units: number };
  undelivered: { returns: number; units: number };
  anyReturns: boolean;
}

/** Jira GRW-637 — what the marketplace (or the shop) refunded on an online order, as recorded. */
export interface OrderRefund {
  id: string;
  lineId: string;
  channel: string;
  refundedBy: 'marketplace' | 'shop';
  amountMinor: string;
  refundedAt: string;
  externalRef: string;
}
export interface RefundRow {
  id: string;
  saleId: string;
  orderRef: string | null;
  channel: string;
  lineName: string;
  amountMinor: string;
  refundedBy: 'marketplace' | 'shop';
  refundedAt: string;
  externalRef: string;
}
export interface RefundsReportPage {
  window: { key: string; label: string; startISO: string; endExclusiveISO: string };
  rows: RefundRow[];
  totals: { count: number; amountMinor: string; byChannel: Array<{ channel: string; count: number; amountMinor: string }> };
  page: number;
  pageSize: number;
}
