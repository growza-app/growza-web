import { formatDateTime, formatMoneyMinor } from './format';

/**
 * How to render one diff field, by entity type + field name (GRW-99).
 *
 * Deliberately NOT pattern-matched off the key name — `_minor` as a naming
 * convention is a hint, not a contract, and money is exactly the field a
 * wrong guess misleads on (20000 read as ₹20,000 instead of ₹200). This map
 * is the honest alternative available today: the real entity schemas
 * (zod, elsewhere in the codebase) aren't reachable from this frontend
 * package, so each row here is copied straight from what the four migrated
 * audit writers actually put in a diff (src/modules/booking/{confirm,
 * checkout,cancel,repository}.ts) — grown the same way the AuditAction
 * vocabulary itself grows, one real writer at a time, never speculatively.
 * A field that isn't listed here still renders — plainly, never guessed at.
 */
type FieldKind = 'money' | 'date' | 'status' | 'text';

const ENTITY_FIELD_KINDS: Record<string, Record<string, FieldKind>> = {
  appointment: {
    status: 'status',
    startAt: 'date',
    paidAmountMinor: 'money',
    paymentMode: 'text',
    serviceId: 'text',
    createdVia: 'text',
    bookingGroupId: 'text',
    schedulableId: 'text',
  },
  // GRW-82's discount_set/discount_remove diffs — copied straight from what
  // admin-routes.ts actually writes, same discipline as the appointment map.
  // Deliberately not adding a `status` entry here too: subscription.status
  // values ('ACTIVE'/'CANCELLED'/...) aren't in STATUS_COLORS below, and
  // subscription.status_update's diffs are a different writer's concern —
  // "grown one real writer at a time," not spoken for by this story.
  subscription: {
    discountAmountMinor: 'money',
    finalPriceMinor: 'money',
    // QA pass 7 — discount_set/discount_remove diffs widened to every field
    // the route can change, not just the two money columns; discountType
    // stays undeclared (renders as plain text, same as reaching the
    // fallback below) since 'fixed'/'percent'/'final' aren't a status
    // vocabulary.
    discountReason: 'text',
    discountEndsAt: 'date',
    // Jira GRW-241 · GRW-242 — AutoPay amounts are minor units, never a bare number.
    mandateAmountMinor: 'money',
    fromAmountMinor: 'money',
    toAmountMinor: 'money',
    invoiceTotalMinor: 'money',
    paidMinor: 'money',
    shortfallMinor: 'money',
  },
};

const STATUS_COLORS: Record<string, [fg: string, bg: string]> = {
  confirmed: ['oklch(0.5 0.13 150)', 'oklch(0.95 0.035 150)'],
  completed: ['oklch(0.5 0.13 150)', 'oklch(0.95 0.035 150)'],
  cancelled: ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  no_show: ['oklch(0.55 0.17 25)', 'oklch(0.95 0.04 25)'],
  active: ['oklch(0.5 0.13 150)', 'oklch(0.95 0.035 150)'],
  deactivated: ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'],
};

export interface RenderedField {
  key: string;
  kind: FieldKind | 'boolean' | 'list' | 'unknown';
  text: string;
  chip?: [fg: string, bg: string];
}

/** One value in a diff, rendered by its declared kind — or, for a field this frontend has never seen, by its actual runtime type, never by guessing at its name. */
export function renderDiffField(entityType: string | null, key: string, value: unknown, timeZone?: string): RenderedField {
  const declared = entityType ? ENTITY_FIELD_KINDS[entityType]?.[key] : undefined;

  if (value === null || value === undefined) return { key, kind: 'unknown', text: '—' };

  if (declared === 'money' && typeof value === 'number') return { key, kind: 'money', text: formatMoneyMinor(value) };
  if (declared === 'date' && typeof value === 'string') return { key, kind: 'date', text: formatDateTime(value, timeZone) };
  if (declared === 'status' && typeof value === 'string') {
    return { key, kind: 'status', text: value.replace(/_/g, ' '), chip: STATUS_COLORS[value] ?? ['oklch(0.45 0.02 155)', 'oklch(0.95 0.006 150)'] };
  }
  if (declared === 'text' && typeof value === 'string') return { key, kind: 'text', text: value };

  // Not in the map (or the runtime value didn't match what was declared) —
  // fall back to the value's own type. A boolean is unambiguous to render
  // regardless of field name; a number with no declared kind stays a plain
  // number rather than being guessed at as money; a string is always safe
  // to show as plain text.
  if (typeof value === 'boolean') return { key, kind: 'boolean', text: value ? 'On' : 'Off' };
  if (typeof value === 'string' || typeof value === 'number') return { key, kind: 'text', text: String(value) };
  if (Array.isArray(value)) return { key, kind: 'list', text: value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ') };
  return { key, kind: 'unknown', text: JSON.stringify(value) };
}

/** `paidAmountMinor` → `Paid amount`. Cosmetic only — never used to decide a field's kind. */
export function fieldLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\bminor\b/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

const ACTION_LABELS: Record<string, string> = {
  'appointment.create': 'Booking created',
  'appointment.status_change': 'Booking status changed',
  'appointment.checkout': 'Booking checked out',
  'appointment.walk_in': 'Walk-in recorded',
  'appointment.rescheduled': 'Booking rescheduled',
  'appointment.reclaimed': 'Booking reclaimed',
  'appointment.corrected': 'Booking corrected',
  'appointment.stylist_assigned': 'Provider assigned',
  'customer.updated': 'Customer updated',
  'customer.erasure_requested': 'Customer erasure requested',
  'customer.erasure_cancelled': 'Customer erasure cancelled',
  'customer.erased': 'Customer erased',
  'business.create': 'Business enrolled',
  'business.activate': 'Business activated',
  'business.suspend': 'Business suspended',
  'business.reactivate': 'Business reactivated',
  'business.branch_add': 'Branch added',
  'business.branch_close': 'Branch closed',
  'business.branch_reopen': 'Branch reopened',
  'business.branch_make_main': 'Main branch changed',
  'plan.create': 'Plan created',
  'plan.update': 'Plan updated',
  'plan.delete': 'Plan deleted',
  'plan.version_create': 'Plan version created',
  'plan.entitlements_update': 'Plan entitlements updated',
  'subscription.create': 'Subscription created',
  'subscription.status_update': 'Subscription status updated',
  'subscription.entitlement_set': 'Subscription entitlement set',
  'subscription.entitlement_remove': 'Subscription entitlement removed',
  'subscription.discount_set': 'Discount applied',
  'subscription.discount_remove': 'Discount removed',
  'subscription.branch_price_set': 'Branch price updated',
  'subscription.cancel_at_period_end': 'Cancellation scheduled',
  'subscription.reenrol': 'Subscription re-enrolled',
  'subscription.dunning_escalate': 'Dunning escalated',
  'subscription.mandate_requested': 'AutoPay mandate requested',
  'subscription.mandate_state_change': 'AutoPay mandate updated',
  'subscription.mandate_reapproval_requested': 'AutoPay re-approval requested',
  'subscription.mandate_reapproval_reminded': 'AutoPay reminder sent',
  'subscription.mandate_reapproved': 'AutoPay re-approved',
  'subscription.mandate_reapproval_expired': 'AutoPay re-approval expired',
  'subscription.mandate_reapproval_withdrawn': 'AutoPay re-approval withdrawn',
  'subscription.mandate_shortfall': 'AutoPay shortfall recorded',
  'subscription.mandate_cancelled': 'AutoPay mandate cancelled',
  'tax_rule.create': 'Tax rule created',
  'tax_rule.update': 'Tax rule updated',
  'platform_role.create': 'Platform role created',
  'platform_role.update': 'Platform role updated',
  'platform_role.delete': 'Platform role deleted',
  'platform_user.create': 'Administrator added',
  'platform_user.role_update': 'Administrator role changed',
  'platform_user.status_update': 'Administrator status changed',
  'platform_user.password_reset': 'Administrator password reset',
  'payment.record_offline': 'Offline payment recorded',
  'payment.attribution_conflict': 'Payment attribution conflict',
  'payment.refund_recorded': 'Refund recorded',
  'feature_flag.update': 'Feature flag updated',
  'feature_flag.override_set': 'Feature flag override set',
  'feature_flag.override_remove': 'Feature flag override removed',
  'impersonation.start': 'Impersonation started',
  'impersonation.end': 'Impersonation ended',
  'team.member_removed': 'Team member removed',
  'team.role_assigned': 'Team role assigned',
  'attendance.marked': 'Attendance marked',
  'attendance.cleared': 'Attendance cleared',
  'attendance.approved': 'Attendance approved',
  'attendance.rejected': 'Attendance rejected',
  'order.status_change': 'Order status changed',
  'order.client_attached': 'Client attached to order',
  'order.buyer_erased': 'Order buyer erased',
  'order.exchange': 'Order item exchanged',
  'channel.branch_set': 'Channel branch set',
  'channel.credentials_saved': 'Channel credentials saved',
  'channel.stock_buffer_set': 'Channel stock buffer set',
  'channel.queue_retried': 'Channel queue retried',
  'role.created': 'Role created',
  'role.updated': 'Role updated',
  'role.deleted': 'Role deleted',
};

/** Translates a raw dot-separated audit action key into a readable sentence while falling back cleanly for new keys. */
export function formatAuditAction(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  return action
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
