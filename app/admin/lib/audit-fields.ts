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
