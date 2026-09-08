/**
 * Jira GRW-66 · GRW-157 — what a role is offered in the dashboard.
 *
 * One list, read by the sidebar, the bottom nav and the More menu. They used to
 * each hold their own copy, which is how two of them end up disagreeing and a
 * stylist reaches through a menu what the sidebar was careful to hide.
 *
 * **BR-01 — this is a courtesy, not the boundary.** `src/api/tenant-policy.ts`
 * is what actually refuses a staff member; nothing here may become the only
 * thing standing between them and a route. Hiding a link they cannot use is
 * about not wasting their time.
 */
export type MemberRole = 'owner' | 'manager' | 'staff' | 'receptionist';

/**
 * Destinations a `staff` member is offered.
 *
 * Deliberately small, and it matches what the API allows: their own day, and
 * the appointments list that is scoped to them. Everything else in the nav —
 * staff, services, offers, clients, reports, availability, the WhatsApp
 * simulator, settings — is a route GRW-156 closed.
 *
 * `/more` was included on the reasoning that it is where a stylist signs out.
 * QA (GRW-158) checked: it was not. Every row on that menu was owner-only, so
 * it rendered EMPTY for a stylist — a nav destination that went nowhere — and
 * the only "Log out" in the product was a static, unwired row inside owner-only
 * Settings. Nobody could sign out of the tenant app at all, stylist or owner.
 *
 * GRW-160 built sign-out and put it on that menu, outside this filter, so the
 * condition GRW-158 removed `/more` for no longer holds: it now has exactly one
 * row a stylist can use, and it is the one they need most on a shared salon
 * device. Restored on those grounds, not by reverting the reasoning.
 *
 * `/` is deliberately ABSENT. The owner's home leads with the salon's takings
 * and loads four owner-only endpoints, so for a stylist it would be both a
 * disclosure and a broken page. Rather than design a second home screen — which
 * this story puts out of scope — `/` redirects a stylist to their appointments,
 * which is what "their day" already means.
 */
const STAFF_DESTINATIONS: ReadonlySet<string> = new Set(['/appointments', '/more']);

/**
 * Jira GRW-63 · GRW-169 — where the front desk works.
 *
 * The whole diary, the client list, the attendance register, and the menu they
 * sign out from. Not `/reports` or `/settings`, which they cannot reach;
 * not `/providers` or `/services`, which are hiring and pricing.
 *
 * `/` is absent for the same reason it is absent for a stylist: the owner's
 * home leads with the salon's takings and loads endpoints this role is refused,
 * so it would be both a disclosure and a broken page. They land on
 * `/appointments`, which is the desk.
 */
const RECEPTIONIST_DESTINATIONS: ReadonlySet<string> = new Set([
  '/appointments',
  '/customers',
  '/attendance',
  '/more',
]);

/**
 * `role` is optional and an absent one means OWNER (BR-03).
 *
 * The API being unreachable, or a dev session with no token, must not quietly
 * hide half the product from the person who owns it. Restricting on a *known*
 * limited role is the only case that hides anything.
 *
 * A table rather than a chain of comparisons, for the reason `mayReach` grew
 * one: `role !== 'staff'` read as a rule and was really the assumption that
 * there would only ever be one limited role. Adding the receptionist made it
 * false, and the failure was silent — the new role saw the entire nav.
 */
const DESTINATIONS_BY_ROLE: Partial<Record<MemberRole, ReadonlySet<string>>> = {
  staff: STAFF_DESTINATIONS,
  receptionist: RECEPTIONIST_DESTINATIONS,
};

/**
 * Jira GRW-63 · GRW-197 — Reports is offered to a limited role only when the
 * salon has granted them a tab.
 *
 * Passed in rather than looked up, because the answer is per-salon and this
 * module is pure. An empty list means the link stays hidden — which matches
 * the API, where every report route would refuse them.
 */
export function canSeeReports(role?: MemberRole | null, reportTabs?: readonly string[]): boolean {
  if (role !== 'staff' && role !== 'receptionist') return true;
  return (reportTabs?.length ?? 0) > 0;
}

export function canSee(href: string, role?: MemberRole | null, reportTabs?: readonly string[]): boolean {
  if (href === '/reports') return canSeeReports(role, reportTabs);
  const allowed = role ? DESTINATIONS_BY_ROLE[role] : undefined;
  // Owner, manager, and an unknown/absent role all see everything (BR-03).
  // Unlike the API's own table this one errs OPEN, because it hides links
  // rather than guarding data — `mayReach` is the boundary (BR-01), and a nav
  // that quietly went blank would be the worse failure here.
  return allowed ? allowed.has(href) : true;
}

export function visibleItems<T extends { href: string }>(
  items: readonly T[],
  role?: MemberRole | null,
  reportTabs?: readonly string[],
): T[] {
  return items.filter((item) => canSee(item.href, role, reportTabs));
}

/**
 * Whether to show this person the salon's money (FR-04).
 *
 * A receptionist takes payment for a booking and never sees the day's takings:
 * `POST /appointments/:id/checkout` is theirs, `/analytics/today` and
 * `/summary/range` are not (GRW-169). The till is not the books.
 */
export function canSeeRevenue(role?: MemberRole | null): boolean {
  return role !== 'staff' && role !== 'receptionist';
}

/** Roles whose home is the diary rather than the owner's revenue-led dashboard. */
export function homeHref(role?: MemberRole | null): string {
  return role === 'staff' || role === 'receptionist' ? '/appointments' : '/';
}
