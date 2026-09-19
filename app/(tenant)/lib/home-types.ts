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
}

export interface DaySummary {
  date: string;
  locationId: string | null;
  revenueMinor: number;
  bookings: number;
  done: number;
  notDone: number;
  byPaymentMode: PaymentModeSlice[];
  staff: Array<{ id: string; name: string; bookings: number; revenueMinor: number }>;
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
}
