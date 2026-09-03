/**
 * The `payment.status` and `invoice.payment_status` vocabularies, as the
 * screens say them (GRW-119 BR-04).
 *
 * Same job and same discipline as `subscription-status.ts` beside it: the
 * database stores SCREAMING_SNAKE (migrations 0028/0029), an admin never
 * reads one, and the translation lives in exactly one place so the Payments
 * list, the Invoices list, invoice detail and the Billing tab cannot end up
 * calling the same state different things on the same account.
 */

export const PAYMENT_STATUS_VALUES = ['SUCCESS', 'PENDING', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

export const INVOICE_PAYMENT_STATUS_VALUES = ['UNPAID', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

const LABELS: Record<string, string> = {
  SUCCESS: 'Success',
  PENDING: 'Pending',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Part refunded',
  UNPAID: 'Unpaid',
  PAID: 'Paid',
  ISSUED: 'Issued',
  VOID: 'Void',
};

/**
 * Falls back to the raw value rather than to a blank or a guess — the same
 * reasoning `subscriptionStatusLabel` records: if a later story adds a status
 * and forgets this map, the screen shows `DISPUTED`, which is ugly and
 * unmistakably a gap. A prettified fallback would hide it.
 */
export function billingStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}
