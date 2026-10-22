/** Jira GRW-73 — which roles may be offered to a person, as plain functions so a test can ask them instead of reading the screen's source. */
export interface ChoosableRole {
  id: string;
  worksLike: string | null;
}

const GIVEABLE = ['manager', 'receptionist', 'staff'];

/**
 * Roles an invitation may carry: any that works like a manager, a desk or staff (a role that works like nothing is refused by the API).
 * A staff-like login belongs to a person on the roster, and a shop has no screen to put one there: with nobody on it, only the others are offered.
 */
export function rolesToGive<R extends ChoosableRole>(roles: R[], rosterCount: number): R[] {
  return roles.filter((r) => (r.worksLike !== null && GIVEABLE.includes(r.worksLike)) && (r.worksLike !== 'staff' || rosterCount > 0));
}

/** Roles for someone already in the team: only those of the same kind as their login — and the one they hold, so the select never shows a blank for it. */
export function rolesForMember<R extends ChoosableRole>(roles: R[], member: { role: string; tenantRoleId?: string | null }): R[] {
  return roles.filter((r) => ((r.worksLike !== null && GIVEABLE.includes(r.worksLike)) && r.worksLike === member.role) || r.id === member.tenantRoleId);
}
