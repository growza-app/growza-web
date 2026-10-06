/**
 * Jira GRW-556 — what a business that has not gone live yet may open: setting itself up, and nothing else.
 *
 * The API refuses every other write (`SETUP_ALLOWED_WRITES`, GRW-556); this is the half that stops the dashboard
 * OFFERING what would be refused — no Bookings, Clients, Offers or Reports in the menu, no floating "+", no search.
 * Everything the setup banner links to (`setupHref`, setup-copy.ts) is in here, or the banner would send an owner
 * to a screen it had just closed.
 *
 * Plain data, not `@growza-app/shared`: the shared package is a published dependency here, and this is a fact
 * about the dashboard's own screens.
 */

/** A path is a setup destination if it IS one, or is below one (`/settings/working-hours`, `/providers/<id>`). */
const SETUP_ROOTS = ['/services', '/providers', '/settings', '/more', '/not-live-yet'] as const;

export function isSetupDestination(href: string): boolean {
  if (href === '/' || href === '') return true;
  return SETUP_ROOTS.some((root) => href === root || href.startsWith(`${root}/`) || href.startsWith(`${root}?`));
}

/**
 * Is the business live? Only a business `/me` says is `provisioning` is not: an older API, a failed `/me` and
 * every other status read as live, so a degraded session is never shut out of the product (BR-03 of GRW-478).
 */
export function isLive(status: string | null | undefined): boolean {
  return status !== 'provisioning';
}
