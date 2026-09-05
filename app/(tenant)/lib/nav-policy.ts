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
export type MemberRole = 'owner' | 'manager' | 'staff';

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
 * `role` is optional and an absent one means OWNER (BR-03).
 *
 * The API being unreachable, or a dev session with no token, must not quietly
 * hide half the product from the person who owns it. Restricting on a *known*
 * staff role is the only case that hides anything.
 */
export function canSee(href: string, role?: MemberRole | null): boolean {
  if (role !== 'staff') return true;
  return STAFF_DESTINATIONS.has(href);
}

export function visibleItems<T extends { href: string }>(items: readonly T[], role?: MemberRole | null): T[] {
  return items.filter((item) => canSee(item.href, role));
}

/** Whether to show this person the salon's money (FR-04). */
export function canSeeRevenue(role?: MemberRole | null): boolean {
  return role !== 'staff';
}
