import type { RolePageKey } from './api';

/**
 * Jira GRW-608 — which AREAS of the app a business has: bookings, services, and the shop's own two screens.
 *
 * A shop has no diary and no menu of services, and a salon has no Orders; each is offered the set that is its own, and
 * a screen it does not have is ABSENT from its nav and bounced Home if reached by address — never drawn empty. This is
 * the whole of that decision, in one pure module, asked by the one chokepoint every nav surface and every screen guard
 * already asks (`canSee`). No screen asks "what kind of business is this"; the answer arrives here from `/me`, which got
 * it from the vertical's definition.
 *
 * Absent means the full diary set, as it always was: an API a deploy behind, or a `/me` that could not say, leaves a
 * salon exactly the app it had. The nav errs OPEN — it hides links, `src/api/security/feature-routes.ts` is the boundary.
 */
export interface Areas {
  /** `me.capabilities.bookings` — the business takes bookings (a diary, free times, the walk-in queue). */
  bookings: boolean;
  /** `me.capabilities.services` — the business sells services (a menu, packages, offers). */
  services: boolean;
  /** `me.surface === 'shop'` — it runs the shop's screens: Orders and Stock. */
  shop: boolean;
  /**
   * `me.capabilities.stockCounted` — there is a COUNT behind what it sells. False for a kitchen, which cooks a dish
   * when it is ordered.
   *
   * This is not "has a catalogue": a restaurant has a full menu with prices, categories and photos, and sells from
   * it at the same till. It is the count alone — so the screens that exist only to read or change one (the stock
   * worth report, the reorder list) are absent, and the ones that merely SHOW a count beside a thing (the Menu
   * list, the till) draw the thing without it.
   */
  stock: boolean;
  /**
   * Owner, 2026-10-24 — `me.capabilities.marketplaces`: the business sells on Flipkart and Amazon, so it has their
   * screens (importing orders, the orders held for a size, Settings › Online selling). False for a restaurant, whose
   * online orders come from delivery apps. Optional: absent is true, as every shop had them before.
   */
  marketplaces?: boolean;
  /** Owner, 2026-10-24 — `me.deliveryApps`: the apps whose orders the till rings up (Swiggy, Zomato). Absent: none. */
  deliveryApps?: readonly string[];
  /**
   * Jira GRW-74 — the pages a member's ROLE grants, only for a member who holds one. Absent for the owner and for everyone with no role, who are
   * offered what they always were. It travels here because every nav surface and screen guard already carries this object to `canSee`.
   */
  pages?: PageGrid | null;
}

export type PageLevel = 'none' | 'view' | 'manage';
export type PageGrid = Partial<Record<RolePageKey, PageLevel>>;

/** The salon's app: every diary screen, none of the shop's. What an absent answer means. */
export const DIARY_AREAS: Areas = { bookings: true, services: true, shop: false, stock: true };

/** The slice of `/me` this reads — typed loosely, because an older API sends less. */
export interface MeAreas {
  capabilities?: { bookings?: boolean; services?: boolean; stockCounted?: boolean; marketplaces?: boolean } | null;
  surface?: string | null;
  deliveryApps?: readonly string[] | null;
  member?: { role?: string; tenantRoleId?: string | null } | null;
  permissions?: PageGrid | null;
}

/** The areas a `/me` describes. Only an explicit `false` takes an area away, and only `shop` adds the shop's. */
export function areasOf(me: MeAreas | null | undefined): Areas {
  // Only a member who holds a role is offered by the grid; the owner and everyone with no role are not (and carry no `pages` key at all).
  const pages = me?.member && me.member.role !== 'owner' && me.member.tenantRoleId ? me.permissions : undefined;
  return {
    bookings: me?.capabilities?.bookings !== false,
    services: me?.capabilities?.services !== false,
    shop: me?.surface === 'shop',
    stock: me?.capabilities?.stockCounted !== false,
    // Said only when they differ from what every business had before, so the areas of a salon or a shop read as they did.
    ...(me?.capabilities?.marketplaces === false ? { marketplaces: false } : {}),
    ...(me?.deliveryApps && me.deliveryApps.length > 0 ? { deliveryApps: me.deliveryApps } : {}),
    ...(pages ? { pages } : {}),
  };
}

/** Is `href` this route or one under it? (`/appointments` owns `/appointments/new`; `/servicesX` is nobody's.) */
const under = (href: string, route: string): boolean => href === route || href.startsWith(`${route}/`);

/** Screens that exist only for a business with a diary. */
const BOOKING_ROUTES = ['/appointments', '/availability', '/settings/booking'] as const;
/** Screens that exist only for a business with a menu of services. */
const SERVICE_ROUTES = ['/services', '/packages', '/offers'] as const;
/** The shop's own screens. */
const SHOP_ROUTES = ['/orders', '/stock', '/settings/channels'] as const;
/**
 * Screens that exist only where a count does.
 *
 * `/stock` itself is NOT here, and that is the whole subtlety: it is the shop's CATALOGUE screen (the same
 * `ProductsScreen` the Products link opens), reached at the address a shop's nav uses. A kitchen keeps its menu
 * there. What it does not keep is what the shelf is worth (`/stock/report`) or what to order before it runs out
 * (`/stock/order`) — both of which are a count and nothing else.
 */
const COUNT_ROUTES = ['/stock/report', '/stock/order'] as const;
/**
 * What a shop does NOT have beside the diary and the menu: the sales register (Orders is its register) and the staff roster's wizard (a shop's staff are
 * added from Settings › Roles). Its nav is short on purpose.
 *
 * Jira GRW-76 (owner's decision, 2026-10-21) — Attendance and Settings › Location check-in ARE a shop's now. They were listed here because the register was
 * thought of as a stylist's rota, but a shop's staff are the one role the owner said is "only for attendance": without these screens the Staff role could
 * open nothing but Home. The register, a person's own month, and the branch pin that lets them check themselves in are generic; nothing in them is a diary.
 */
const NOT_IN_A_SHOP = ['/sales', '/providers'] as const;

/**
 * Owner, 2026-10-24 — screens that exist only for a business that sells on Flipkart and Amazon: importing their order
 * files, the orders held for a size they did not name, and their keys and branch (Settings › Online selling). Sales by
 * channel (`/stock/channels`) is NOT here: it is how a restaurant reads its Swiggy and Zomato orders too.
 */
const MARKETPLACE_ROUTES = ['/orders/import', '/orders/held', '/settings/channels'] as const;

/** Jira GRW-72 — Settings screens that exist only for a shop. (Not `SHOP_ROUTES`: the role rules read that list as "the shop's own work".) */
const SHOP_SETTINGS = ['/settings/roles'] as const;

/** May a business with these areas be offered this address? True for everything a screen's own rules do not close. */
export function areaAllows(href: string, areas: Areas = DIARY_AREAS): boolean {
  if (!areas.bookings && BOOKING_ROUTES.some((r) => under(href, r))) return false;
  if (!areas.services && SERVICE_ROUTES.some((r) => under(href, r))) return false;
  if (areas.shop && NOT_IN_A_SHOP.some((r) => under(href, r))) return false;
  if (!areas.shop && SHOP_ROUTES.some((r) => under(href, r))) return false;
  if (!areas.shop && SHOP_SETTINGS.some((r) => under(href, r))) return false;
  if (!areas.stock && COUNT_ROUTES.some((r) => under(href, r))) return false;
  if (areas.marketplaces === false && MARKETPLACE_ROUTES.some((r) => under(href, r))) return false;
  return true;
}

/** Is this one of the shop's own screens? (Used by the role rules, which must say who of the shop's staff may open them.) */
export const isShopRoute = (href: string): boolean => SHOP_ROUTES.some((r) => under(href, r));
