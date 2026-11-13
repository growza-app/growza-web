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
const ONE_BRANCH_ONLY = ['/services', '/products', '/stock', '/pos', '/orders/new', '/availability', '/settings', '/appointments/new'];

/**
 * Screens the server draws from `?branch=` (with `BranchUrlSync`). A new pick is written into their address so
 * they redraw; every other screen follows the shared choice in the browser.
 */
const BRANCH_IN_ADDRESS = ['/customers', '/services', '/products', '/stock', '/reports', '/availability', '/offers', '/packages', '/settings'];

/**
 * Jira GRW-396 — the parts of Settings that exist once for the whole business: its name and logo, its
 * branches, who can sign in, who sees what, the bill, and the payment QRs. No branch is being looked at, so
 * no picker.
 *
 * Payments is here although a QR can be a branch's: the screen shows the business's and EVERY branch's at
 * once, so it is not looking at one branch and a picker would narrow nothing.
 */
/* Jira GRW-647 — Phone alerts is here too: it sets up one PERSON's phone, which no branch owns a part of. */
const WHOLE_BUSINESS = ['/settings/business', '/settings/branches', '/settings/payments', '/settings/report-access', '/settings/roles', '/settings/billing', '/settings/channels', '/settings/alerts', '/settings/rewards'];

function matches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/*
 * Owner's review 2026-11-13 — `/stock` is the Products screen at a shop's own address (Jira GRW-608) and was left
 * off both lists, so its header said "All branches" over one branch's shelf and a banner had to explain. The
 * reports under it (`/stock/report`, `/stock/order`, …) are NOT the shelf: they follow the shared choice and
 * do offer "All", as they did, so the shelf's address is the only `/stock` path on either list.
 */
const isStockReport = (pathname: string) => pathname.startsWith('/stock/');

export function oneBranchOnly(pathname: string): boolean {
  if (isStockReport(pathname)) return false;
  return ONE_BRANCH_ONLY.some((route) => matches(pathname, route));
}

export function branchInAddress(pathname: string): boolean {
  if (pathname === '/products/sell' || isStockReport(pathname)) return false;
  return BRANCH_IN_ADDRESS.some((route) => matches(pathname, route));
}

/*
 * Owner's review 2026-11-13 — one order is one branch's: the header said "All branches" over a Sector 17 sale and
 * the picker did nothing. The order's own line names its branch, so the detail is a no-picker screen. The list
 * (`/orders`), Returns, Refunds, New and Held are not ids and keep theirs.
 */
const ORDER_DETAIL = /^\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function wholeBusiness(pathname: string): boolean {
  if (ORDER_DETAIL.test(pathname)) return true;
  return WHOLE_BUSINESS.some((route) => matches(pathname, route));
}
