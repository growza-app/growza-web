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
import { areaAllows, isShopRoute, type Areas } from './areas';

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
 * May this role see this destination — and, until the business is live, is it one of the setup ones?
 *
 * Jira GRW-608 — and has this business that AREA? `areas` is the fifth question and the only new one: a business with
 * no diary is not offered the diary's screens, one with no menu is not offered the menu, and a shop is offered Orders
 * and Stock. Absent means the salon's full set, so every existing caller is unchanged until it passes one.
 */
export function canSee(href: string, role?: MemberRole | null, reportTabs?: readonly string[], live = true, areas?: Areas): boolean {
  if (ALWAYS_OPEN.has(href)) return true;
  if (!areaAllows(href, areas)) return false;
  /*
   * The shop's own screens (Jira GRW-608). Neither is a route @growza-app/shared lists for any role, so the answer is
   * given here: the owner and manager open both (the answer for the shelf), the front desk opens Orders — it takes them
   * — and no one else opens either. `areaAllows` above already refused a business that is not a shop.
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
  if (href.startsWith('/products/sell')) {
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
