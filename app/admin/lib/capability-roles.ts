/**
 * GRW-296 — which in-tenant role an entitlement is really about, for the
 * plan editor's role-grouped view.
 *
 * This is presentation-only. Capabilities (`src/platform/capabilities.ts`)
 * are tenant-level commercial entitlements — what a plan sells — and are
 * deliberately separate from RBAC roles (owner/manager/receptionist/staff,
 * `docs/architecture/13-permission-matrix.md`). `13-platform-administration.md`
 * names these "three independent gates" (feature flag / capability / RBAC)
 * that must never be conflated. Nothing below changes what a capability
 * grants or who RBAC lets do what — it only decides which heading a key
 * renders under on a screen built for a human who thinks in roles, not in
 * `booking.*` prefixes. If someone goes looking for where this is
 * *enforced*: nowhere. It isn't.
 *
 * Keyed per capability KEY, not per technical group (`capability-groups.ts`'s
 * `group`) — the two don't line up. `dashboard` alone splits across Stylist
 * (`staff_login`, `staff_leaderboard`) and Owner (`rich_analytics`); a
 * group-level map couldn't express that.
 */
export const CAPABILITY_ROLE_ORDER = ['owner', 'receptionist', 'stylist'];

export const CAPABILITY_ROLE_LABEL: Record<string, string> = {
  owner: 'Owner / Business',
  receptionist: 'Receptionist / Front-desk',
  stylist: 'Stylist / Staff',
};

export function capabilityRoleLabel(role: string): string {
  return CAPABILITY_ROLE_LABEL[role] ?? role;
}

/**
 * Deliberately lopsided — 12 Owner, 8 Receptionist, 2 Stylist — because
 * that is what the registry actually gates today: most keys are booking-flow
 * or business-policy, only two are about staff themselves. A key added to
 * the registry and missing from this map defaults to Owner (never dropped),
 * which is the safer miss: an admin sees one extra row under Owner rather
 * than a capability that silently renders nowhere.
 */
const CAPABILITY_ROLE_BY_KEY: Record<string, string> = {
  // Receptionist / Front-desk — the booking-flow toggles a front-desk
  // person lives in day to day.
  'booking.provider_selection': 'receptionist',
  'booking.any_provider': 'receptionist',
  'booking.resources': 'receptionist',
  'booking.custom_fields': 'receptionist',
  'booking.capacity_gt1': 'receptionist',
  'booking.walk_in': 'receptionist',
  'booking.reschedule': 'receptionist',
  'booking.cancellation': 'receptionist',

  // Stylist / Staff — the only two things the PLAN gates for staff
  // themselves; everything else about a stylist's day is Roles &
  // permissions, not this screen.
  'dashboard.staff_login': 'stylist',
  'dashboard.staff_leaderboard': 'stylist',

  // Owner / Business — messaging policy, catalog/scheduling policy,
  // reporting, bot/conversation policy, every plan-scale limit.
  'messaging.reminders': 'owner',
  'messaging.marketing': 'owner',
  'catalog.categories': 'owner',
  'scheduling.gap_packed': 'owner',
  'dashboard.rich_analytics': 'owner',
  'conversation.handoff': 'owner',
  'conversation.ttl_minutes': 'owner',
  'limits.max_providers': 'owner',
  'limits.max_locations': 'owner',
  'limits.max_reminder_rules': 'owner',
  'limits.monthly_marketing_msgs': 'owner',
  'limits.monthly_bookings': 'owner',
};

export function roleForKey(key: string): string {
  return CAPABILITY_ROLE_BY_KEY[key] ?? 'owner';
}

/** Roles in display order: the known ones first, then anything unmapped. */
export function orderCapabilityRoles<T extends { key: string }>(rows: T[]): { role: string; rows: T[] }[] {
  const byRole = new Map<string, T[]>();
  for (const row of rows) {
    const role = roleForKey(row.key);
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(row);
  }
  const known = CAPABILITY_ROLE_ORDER.filter((r) => byRole.has(r));
  const unknown = [...byRole.keys()].filter((r) => !CAPABILITY_ROLE_ORDER.includes(r)).sort();
  return [...known, ...unknown].map((role) => ({ role, rows: byRole.get(role)! }));
}
