/**
 * Jira GRW-370 — moved to @growza-app/shared (`shared/src/nav-policy.ts`) so the
 * API's tests can check the dashboard's nav against the API's own allowlist
 * without importing web code. Kept as a re-export so every screen's import
 * stays the same.
 *
 * Jira GRW-556 — except `canSee` and `visibleItems`, which take a fourth argument: whether the business is live.
 * They stay the one chokepoint every nav SURFACE asks (the sidebar, the tab bar, the More menu, Home's tiles), so
 * "a business being set up offers four destinations" is decided here and not four times.
 *
 * The screen guards are deliberately not in that list. `guardScreen` asks this WITHOUT the flag and tests the
 * status itself, because its two refusals land somewhere different: a role that may never see a screen goes Home,
 * and a screen that merely opens later goes to the page that says so. Folding them together would tell an owner
 * their own Offers screen does not exist.
 */
import { canSee as roleCanSee, visibleItems as roleVisibleItems, type MemberRole } from '@growza-app/shared';
import { isSetupDestination } from './go-live';
import { areaAllows, isShopRoute, type Areas, type PageGrid } from './areas';

export {
  canSeeReports,
  canSeeRevenue,
  homeHref,
  homeKind,
  mayUse,
  type HomeKind,
  type MemberRole,
  type UiAction,
} from '@growza-app/shared';

/**
 * Jira GRW-564 — addresses open to everyone, whatever their role and whatever
 * state the business is in.
 *
 * `/help` is the only one, and it is deliberately ABOVE both gates rather than
 * added to the role lists in `@growza-app/shared`:
 *
 *  - It is not an API route. Shared's lists exist so the API's tests can check
 *    this nav against the API's own allowlist; there is nothing there to check,
 *    because the page reads `/me` and nothing else, and every role may call it.
 *  - The moments somebody needs support most are the ones the gates close:
 *    a business still being set up, or one suspended for non-payment. Putting
 *    help behind either of those is putting the way out behind the problem.
 *
 * Kept as a set rather than a comparison so the next one is a line, not a
 * second mechanism.
 */
const ALWAYS_OPEN: ReadonlySet<string> = new Set(['/help']);


/**
 * Jira GRW-74 — which page of the role grid each destination belongs to. A destination not listed (Home, the menu, notifications, help) is open to
 * every member. The same mapping the API's route table makes, written out for addresses; `@growza-app/shared` carries the routes (1.0.19, not yet in the
 * pin), so this is local until the pin moves.
 */
export const PAGE_OF_HREF: ReadonlyArray<readonly [string, keyof PageGrid]> = [
  ['/appointments', 'bookings'],
  ['/availability', 'bookings'],
  ['/orders', 'bookings'],
  ['/sales', 'bookings'],
  ['/documents', 'bookings'],
  ['/products/sell', 'bookings'],
  ['/pos', 'bookings'],
  ['/try-whatsapp', 'bookings'],
  ['/customers', 'clients'],
  // The one-box search finds bookings as well as clients, so it follows the page it reveals more of.
  ['/search', 'bookings'],
  ['/notifications', 'bookings'],
  ['/services', 'services'],
  ['/products', 'services'],
  ['/stock', 'services'],
  ['/packages', 'offers'],
  ['/offers', 'offers'],
  ['/providers', 'staff'],
  ['/attendance', 'attendance'],
  ['/reports', 'reports'],
  ['/settings', 'settings'],
];

/**
 * Destinations that need MORE than their own page, because the screen reads from two (the API refuses each read on its own page):
 * - Orders and the register read the sales, and the money in them is Reports' (`maySeeSales`) — the same rule the fixed receptionist had, where Orders
 *   opened only once the owner had granted the `sales` tab;
 * - the till sells from the shelf (Stock) as well as taking the order (Orders).
 */
const ALSO_NEEDS: ReadonlyArray<readonly [string, keyof PageGrid]> = [
  // A shop's till is `/products/sell` under another address (Jira GRW-616): the same two pages. Listed BEFORE `/orders`, which would otherwise claim it.
  ['/orders/new', 'services'],
  ['/pos', 'services'],
  ['/orders', 'reports'],
  ['/sales', 'reports'],
  ['/products/sell', 'services'],
];

/** Destinations the grid can never open: the API makes these the owner's alone (billing, branches, team, roles). */
const OWNER_ONLY_HREF: readonly string[] = ['/settings/billing', '/settings/branches', '/settings/team', '/settings/roles'];

/**
 * Screens whose whole job is a write: opened at See they would draw a form every control of which the API refuses, so they need Change to be
 * offered at all (Jira GRW-76). The till and a new booking take an order or a visit; there is no read-only version of either.
 */
const NEEDS_CHANGE_TO_OPEN: readonly string[] = ['/products/sell', '/orders/new', '/pos', '/appointments/new', '/try-whatsapp'];

/** The page a destination belongs to, or undefined when it is open to every member. */
export function pageOfHref(href: string): keyof PageGrid | undefined {
  return PAGE_OF_HREF.find(([prefix]) => href === prefix || href.startsWith(`${prefix}/`))?.[1];
}

/**
 * May the role CHANGE things on the screen at this address? A screen of a page held at See is read-only: the controls that write are left undrawn,
 * the way a business suspended for non-payment is (`useWritable`). A screen belonging to no page (Home, the menu) is not the grid's to limit.
 */
export function gridCanChange(href: string, grid: PageGrid): boolean {
  const page = pageOfHref(href);
  return page === undefined || grid[page] === 'manage';
}

/** Does the member's role open this destination? `none` hides it; a page it does not belong to is open. */
export function gridCanSee(rawHref: string, grid: PageGrid): boolean {
  // A query string is not part of the address the grid is asked about.
  const href = rawHref.split('?')[0]!;
  if (NEEDS_CHANGE_TO_OPEN.some((p) => href === p || href.startsWith(`${p}/`)) && !gridCanChange(href, grid)) return false;
  if (OWNER_ONLY_HREF.some((p) => href === p || href.startsWith(`${p}/`))) return false;
  const extra = ALSO_NEEDS.find(([prefix]) => href === prefix || href.startsWith(`${prefix}/`));
  if (extra && (grid[extra[1]] ?? 'none') === 'none') return false;
  const page = pageOfHref(href);
  return page ? (grid[page] ?? 'none') !== 'none' : true;
}

/**
 * May this role see this destination — and, until the business is live, is it one of the setup ones?
 *
 * Jira GRW-608 — and has this business that AREA? `areas` is the fifth question and the only new one: a business with
 * no diary is not offered the diary's screens, one with no menu is not offered the menu, and a shop is offered Orders
 * and Stock. Absent means the salon's full set, so every existing caller is unchanged until it passes one.
 */
export function canSee(href: string, role?: MemberRole | null, reportTabs?: readonly string[], live = true, areas?: Areas): boolean {
  if (ALWAYS_OPEN.has(href)) return true;
  if (!areaAllows(href, areas)) return false;
  // Jira GRW-74 — a member who holds a role is offered what the role grants, and nothing is asked of the fixed role they work like.
  if (areas?.pages) return (live || isSetupDestination(href)) && gridCanSee(href, areas.pages);
  /*
   * The shop's own screens (Jira GRW-608). Neither is a route @growza-app/shared lists for any role, so the answer is
   * given here: the owner and manager open both, and no one else opens Stock. `areaAllows` above already refused a
   * business that is not a shop.
   *
   * ORDERS is the front desk's too (Jira GRW-614). It is where the parcel it is packing is found, and the list the API
   * serves it carries no amounts unless the owner has opened the `sales` tab — so the screen always works for that role,
   * and shows the shop's money only to one allowed to see it. (Until this story `/orders` was the Sales register under
   * another name, whose only read the API refuses a desk without that tab, so the desk was offered it only WITH the tab:
   * Jira GRW-611's review. A list that works for the desk is what removed the reason for that rule.)
   */
  if (isShopRoute(href)) {
    if (!(live || isSetupDestination(href))) return false;
    if (role === 'receptionist') return href.startsWith('/orders');
    return roleCanSee('/products', role, reportTabs?.filter((t) => t !== 'sales'));
  }
  // The `sales` entry of `reportTabs` is the owner opening the Sales register to a receptionist; it is not a Reports
  // tab, so it must not make Reports itself appear (and, for everything else, is simply left out of the list).
  const tabs = reportTabs?.filter((t) => t !== 'sales');
  /*
   * The retail till. @growza-app/shared 1.0.11 names '/products/sell' for a receptionist; the pin here is behind it,
   * so the answer is given locally. Delete this block when the pin reaches 1.0.11 — `roleCanSee` then answers it.
   * It is NOT '/products': the catalogue (cost prices, delete, transfer between branches) stays the owner's.
   */
  // The POS tab IS the till (`/products/sell` now lands on it), so it takes the till's answer exactly.
  if (href === '/pos' || href.startsWith('/products/sell')) {
    if (!(live || isSetupDestination(href))) return false;
    if (role === 'receptionist') return true;
    return roleCanSee('/products', role, tabs);
  }
  if (href.startsWith('/sales')) {
    if (!(live || isSetupDestination(href))) return false;
    // A receptionist sees the register only when the salon has opened it; the others follow Clients' answer as before.
    if (role === 'receptionist') return Boolean(reportTabs?.includes('sales'));
    // Until the pin moves to @growza-app/shared 1.0.10 (which no longer lists '/sales' for a receptionist) the register
    // borrows Clients' answer for owner, manager and stylist. Delete this alias when the pin moves.
    return roleCanSee('/customers', role, tabs);
  }
  return (live || isSetupDestination(href)) && roleCanSee(href, role, tabs);
}

export function visibleItems<T extends { href: string }>(items: readonly T[], role?: MemberRole | null, reportTabs?: readonly string[], live = true, areas?: Areas): T[] {
  return items.filter((item) => canSee(item.href, role, reportTabs, live, areas));
}
