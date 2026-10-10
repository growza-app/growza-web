/**
 * Jira GRW-395 — what each screen does with the header's branch, decided in one place.
 *
 * The header picker (`HeaderBranchPicker`) is the same on every screen; screens differ in two ways, and this is
 * the list of both, so a new screen is one line here rather than another picker of its own.
 */

/**
 * Screens that can only ever show ONE branch: a branch's menu, a branch's free times and a branch's settings
 * (Jira GRW-396 — Settings has no "all"). The picker offers no "All" on them and shows the branch they are
 * showing.
 *
 * Record payment joins them (owner, 2026-10-10). A sale is taken at a counter, and a counter is at one branch:
 * its services, its stylists and its till all belong to that branch, so "All branches" would name no till the
 * money could go into.
 */
const ONE_BRANCH_ONLY = ['/services', '/availability', '/settings', '/appointments/new'];

/**
 * Screens the server draws from `?branch=` (with `BranchUrlSync`). A new pick is written into their address so
 * they redraw; every other screen follows the shared choice in the browser.
 */
const BRANCH_IN_ADDRESS = ['/customers', '/services', '/reports', '/availability', '/offers', '/packages', '/settings'];

/**
 * Jira GRW-396 — the parts of Settings that exist once for the whole business: its name and logo, its
 * branches, who can sign in, who sees what, and the bill. No branch is being looked at, so no picker.
 */
const WHOLE_BUSINESS = ['/settings/business', '/settings/branches', '/settings/team', '/settings/report-access', '/settings/billing'];

function matches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function oneBranchOnly(pathname: string): boolean {
  return ONE_BRANCH_ONLY.some((route) => matches(pathname, route));
}

export function branchInAddress(pathname: string): boolean {
  return BRANCH_IN_ADDRESS.some((route) => matches(pathname, route));
}

export function wholeBusiness(pathname: string): boolean {
  return WHOLE_BUSINESS.some((route) => matches(pathname, route));
}
