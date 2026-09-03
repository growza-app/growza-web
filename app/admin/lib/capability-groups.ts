/**
 * How capability keys are grouped and named on screen.
 *
 * Extracted from the plan entitlement editor (GRW-107) when the subscription
 * override editor (GRW-112) needed the same grouping: the plan editor and the
 * per-customer editor sit two clicks apart and describe the same registry, so
 * a key appearing under "Messaging" on one and "messaging" on the other is a
 * difference an admin has to reconcile for no reason.
 *
 * `group` itself comes from the registry, not from here — this only decides
 * the order groups appear in and how their names are written. A group added
 * to capabilities.ts and missing from the list below still renders, last,
 * under its raw key.
 */
export const CAPABILITY_GROUP_ORDER = ['booking', 'messaging', 'catalog', 'scheduling', 'dashboard', 'conversation', 'limits'];

export const CAPABILITY_GROUP_LABEL: Record<string, string> = {
  booking: 'Booking',
  messaging: 'Messaging',
  catalog: 'Catalog',
  scheduling: 'Scheduling',
  dashboard: 'Dashboard',
  conversation: 'Conversation',
  limits: 'Limits',
};

export function capabilityGroupLabel(group: string): string {
  return CAPABILITY_GROUP_LABEL[group] ?? group;
}

/** Groups in display order: the known ones first, then anything the registry has that this file does not. */
export function orderCapabilityGroups<T extends { group: string }>(rows: T[]): { group: string; rows: T[] }[] {
  const byGroup = new Map<string, T[]>();
  for (const row of rows) {
    if (!byGroup.has(row.group)) byGroup.set(row.group, []);
    byGroup.get(row.group)!.push(row);
  }
  const known = CAPABILITY_GROUP_ORDER.filter((g) => byGroup.has(g));
  const unknown = [...byGroup.keys()].filter((g) => !CAPABILITY_GROUP_ORDER.includes(g)).sort();
  return [...known, ...unknown].map((group) => ({ group, rows: byGroup.get(group)! }));
}
