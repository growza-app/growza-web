/**
 * Jira GRW-222 — the shapes `/api/v1/home` and `/api/v1/home/day-summary` send.
 *
 * Their own file for the reason `report-types.ts` has one: `api-types.ts` is at
 * the line-count cap, and a screen's wire types sit better beside each other
 * than appended to the end of every other screen's.
 */
export type HomePeriod = 'today' | 'week' | 'month';
export type PaymentModeKey = 'upi' | 'cash' | 'card' | 'other' | 'not_recorded';

export interface PaymentModeSlice {
  mode: PaymentModeKey;
  /** Minor units. */
  revenueMinor: number;
}

export interface HomeOverview {
  locationId: string | null;
  timezone: string;
  money: {
    period: HomePeriod;
    revenueMinor: number;
    previousRevenueMinor: number;
    /** Null when the previous period took nothing — shown as no badge, never "↑ ∞". */
    deltaPct: number | null;
    bookings: number;
    newCustomers: number;
    cameBackPct: number | null;
    byPaymentMode: PaymentModeSlice[];
  };
  /** The graph's span follows the period: this week for Today and Week, this month for Month. */
  week: { span: 'week' | 'month'; revenueMinor: number; days: Array<{ date: string; weekday: string; revenueMinor: number; future: boolean }> };
  attention: { notMarkedDone: number; cancelledToday: number };
  /** Every active branch, primary first. More than one is what "multi-branch" means. */
  branches: Array<{ id: string; name: string; isPrimary: boolean; bookingsToday: number; revenueTodayMinor: number; revenueMinor: number }>;
  hoursToday: { opensAt: string | null; closesAt: string | null; afterClose: boolean };
  /**
   * Jira GRW-406 — today's tokens whatever the period, for the owner Home's "Tokens today" card: the branch asked
   * for (or all), and every open branch. Optional so an older API does not break the Home.
   */
  tokensToday?: TokenCountsToday & { byBranch: Array<TokenCountsToday & { id: string; name: string }> };
}

/**
 * Jira GRW-406 — issued = waiting + served + left + cancelled; served = with a stylist + paid; left = went without
 * being served; cancelled = the visit behind it was cancelled or missed (counted there, not as left).
 */
export interface TokenFigures {
  issued: number;
  /** Review round 2 of Jira GRW-406 — optional only so an older API does not break the screens. */
  waiting?: number;
  served: number;
  paid: number;
  left: number;
  cancelled: number;
}
export interface TokenCountsToday extends TokenFigures {
  waiting: number;
  withStylist: number;
}

export interface DaySummary {
  date: string;
  locationId: string | null;
  revenueMinor: number;
  bookings: number;
  done: number;
  notDone: number;
  byPaymentMode: PaymentModeSlice[];
  /** Jira GRW-363 — `key: 'unassigned'` marks the no-stylist row; its `name` is English, so Home words it. */
  staff: Array<{ id: string; name: string; bookings: number; revenueMinor: number; key?: 'unassigned' }>;
  /** Jira GRW-222 — who the day was for. */
  clients: {
    served: number;
    newClients: number;
    newNames: Array<{ id: string; name: string | null }>;
    cameBack: number;
    rebooked: number;
    noShows: number;
    noShowNames: Array<{ id: string; name: string | null }>;
    walkedOut: number;
    topSpenders: Array<{ id: string; name: string | null; revenueMinor: number }>;
    byChannel: { whatsapp: number; counter: number };
    tomorrowBookings: number;
  };
  /** Jira GRW-406 — today's tokens. Optional so an older API does not break the sheet. */
  tokens?: TokenFigures;
}

/** Jira GRW-222 — one walk-in waiting to be seen, first come first served. */
export interface QueueEntry {
  id: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  serviceIds: string[];
  serviceNames: string[];
  offerId: string | null;
  /** When they were added — which is when they arrived. */
  addedAt: string;
  /** Jira GRW-284 — the number the client is told, per branch per day. */
  tokenNo: number | null;
  /** Jira GRW-379 — the branch they wait at. Optional so an older API does not break the list. */
  locationId?: string;
}

/**
 * Jira GRW-403 (epic GRW-283) — where a token is. Derived on the server from its visit (`TOKEN_STATE_SQL`), never
 * stored: waiting, with a stylist, paid, or left without being served.
 */
export type TokenState = 'waiting' | 'with_stylist' | 'paid' | 'left' | 'cancelled';

/** Jira GRW-403 — one token of the day, with the visit behind it once there is one. */
export interface TokenRow {
  id: string;
  tokenNo: number | null;
  state: TokenState;
  customerId: string | null;
  /** Null when the client gave neither a name nor a number (GRW-403 review): show a translated "No name". */
  customerName: string | null;
  customerPhone: string | null;
  serviceIds: string[];
  serviceNames: string[];
  offerId: string | null;
  addedAt: string;
  locationId: string;
  appointmentId: string | null;
  /** Jira GRW-405 — issued when a client with a booking arrived; the visit's time is the booked time. */
  booked: boolean;
  /** Every leg of the visit, earliest first. */
  legIds: string[];
  providerId: string | null;
  providerName: string | null;
  visitStartAt: string | null;
  /** Minor units; null until paid. */
  paidMinor: number | null;
  paymentMode: string | null;
}

export interface TokenBoard {
  date: string;
  counts: { issued: number; waiting: number; withStylist: number; paid: number; left: number; cancelled: number };
  tokens: TokenRow[];
}
