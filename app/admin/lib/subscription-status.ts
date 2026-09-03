/**
 * The `subscription.status` vocabulary, as the screens say it (GRW-111).
 *
 * The database stores nine SCREAMING_SNAKE values (migration 0021's CHECK);
 * an admin should never read one. This is the single translation, so the
 * list, the detail screen and anything GRW-84's lifecycle work adds all use
 * the same words for the same state — the alternative is two screens calling
 * `GRACE_PERIOD` different things on the same account.
 *
 * The order below is the order the filter offers them: the two healthy states
 * first, then the payment-trouble states in the order a subscription actually
 * passes through them, then the ends.
 */
export const SUBSCRIPTION_STATUS_VALUES = [
  'ACTIVE',
  'TRIAL',
  'PAYMENT_FAILED',
  'GRACE_PERIOD',
  'PAST_DUE',
  'PAUSED',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
] as const;

const LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  TRIAL: 'Trial',
  PAYMENT_FAILED: 'Payment failed',
  GRACE_PERIOD: 'Grace period',
  PAST_DUE: 'Past due',
  PAUSED: 'Paused',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

/**
 * Falls back to the raw value rather than to a blank or a guess: if GRW-84
 * adds a tenth status and forgets this map, the screen shows `DUNNING` —
 * ugly, and unmistakably a gap. A prettified fallback would hide it.
 */
export function subscriptionStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}

/** CANCELLED and EXPIRED are end states (GRW-109 BR-04) — nothing more happens to them. */
export function isTerminalSubscriptionStatus(status: string): boolean {
  return status === 'CANCELLED' || status === 'EXPIRED';
}
