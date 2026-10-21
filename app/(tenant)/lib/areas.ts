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
   * Jira GRW-74 — the pages a member's ROLE grants, only for a member who holds one. Absent for the owner and for everyone with no role, who are
   * offered what they always were. It travels here because every nav surface and screen guard already carries this object to `canSee`.
   */
  pages?: PageGrid | null;
}

export type PageLevel = 'none' | 'view' | 'manage';
export type PageGrid = Partial<Record<'bookings' | 'clients' | 'services' | 'offers' | 'staff' | 'attendance' | 'reports' | 'settings', PageLevel>>;

/** The salon's app: every diary screen, none of the shop's. What an absent answer means. */
export const DIARY_AREAS: Areas = { bookings: true, services: true, shop: false };

/** The slice of `/me` this reads — typed loosely, because an older API sends less. */
export interface MeAreas {
  capabilities?: { bookings?: boolean; services?: boolean } | null;
  surface?: string | null;
  member?: { role?: string; tenantRoleId?: string | null } | null;
  permissions?: PageGrid | null;
}

/** The areas a `/me` describes. Only an explicit `false` takes a diary area away, and only `shop` adds the shop's. */
export function areasOf(me: MeAreas | null | undefined): Areas {
  // Only a member who holds a role is offered by the grid; the owner and everyone with no role are not (and carry no `pages` key at all).
  const pages = me?.member && me.member.role !== 'owner' && me.member.tenantRoleId ? me.permissions : undefined;
  return {
    bookings: me?.capabilities?.bookings !== false,
    services: me?.capabilities?.services !== false,
    shop: me?.surface === 'shop',
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
const SHOP_ROUTES = ['/orders', '/stock'] as const;
/**
 * What a shop does NOT have beside the diary and the menu: the sales register (Orders is its register), and the staff
 * rota and attendance, with the setting that lets staff mark themselves in (it keeps no chairs and no stylists'
 * calendars). Its nav is short on purpose.
 */
const NOT_IN_A_SHOP = ['/sales', '/providers', '/attendance', '/settings/check-in'] as const;

/** Jira GRW-72 — Settings screens that exist only for a shop. (Not `SHOP_ROUTES`: the role rules read that list as "the shop's own work".) */
const SHOP_SETTINGS = ['/settings/roles'] as const;

/** May a business with these areas be offered this address? True for everything a screen's own rules do not close. */
export function areaAllows(href: string, areas: Areas = DIARY_AREAS): boolean {
  if (!areas.bookings && BOOKING_ROUTES.some((r) => under(href, r))) return false;
  if (!areas.services && SERVICE_ROUTES.some((r) => under(href, r))) return false;
  if (areas.shop && NOT_IN_A_SHOP.some((r) => under(href, r))) return false;
  if (!areas.shop && SHOP_ROUTES.some((r) => under(href, r))) return false;
  if (!areas.shop && SHOP_SETTINGS.some((r) => under(href, r))) return false;
  return true;
}

/** Is this one of the shop's own screens? (Used by the role rules, which must say who of the shop's staff may open them.) */
export const isShopRoute = (href: string): boolean => SHOP_ROUTES.some((r) => under(href, r));
