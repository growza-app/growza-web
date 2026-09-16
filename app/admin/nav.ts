import type { IconName } from './icons';

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /**
   * The permission this screen's own endpoints require. The sidebar hides
   * items an admin cannot use — it used to offer all twelve to everyone, so a
   * billing admin clicking "Businesses" got a full-page permission error for a
   * screen the nav had just invited them to open.
   *
   * Hiding is a courtesy, never the control: every endpoint refuses
   * independently, server-side (admin-routes.ts's own deny-by-default hook).
   */
  permission: AdminPermission;
}

/** Mirrors the keys in src/platform/admin-permissions.ts. */
export type AdminPermission =
  | 'admin.dashboard.view'
  | 'admin.business.view'
  | 'admin.user.view'
  | 'admin.role.view'
  | 'admin.plan.view'
  | 'admin.subscription.view'
  | 'admin.payment.view'
  | 'admin.invoice.view'
  | 'admin.usage.view'
  | 'admin.feature_flag.view'
  | 'admin.impersonation.start'
  | 'admin.audit.view'
  | 'admin.configuration.view';
export interface NavGroup {
  group: string;
  items: NavItem[];
}

/** The admin sidebar, grouped exactly as Admin.dc.html groups it. */
export const NAV_GROUPS: NavGroup[] = [
  { group: 'Overview', items: [{ label: 'Dashboard', href: '/admin', permission: 'admin.dashboard.view', icon: 'dashboard' }] },
  {
    group: 'Platform',
    items: [
      { label: 'Businesses', href: '/admin/businesses', permission: 'admin.business.view', icon: 'businesses' },
      { label: 'Platform users', href: '/admin/users', permission: 'admin.user.view', icon: 'users' },
      { label: 'Roles & permissions', href: '/admin/roles', permission: 'admin.role.view', icon: 'roles' },
    ],
  },
  {
    group: 'Billing',
    items: [
      { label: 'Plans', href: '/admin/plans', permission: 'admin.plan.view', icon: 'plans' },
      { label: 'Subscriptions', href: '/admin/subscriptions', permission: 'admin.subscription.view', icon: 'subs' },
      { label: 'Payments', href: '/admin/payments', permission: 'admin.payment.view', icon: 'payments' },
      { label: 'Invoices', href: '/admin/invoices', permission: 'admin.invoice.view', icon: 'invoices' },
      { label: 'Usage', href: '/admin/usage', permission: 'admin.usage.view', icon: 'usage' },
    ],
  },
  { group: 'Control', items: [{ label: 'Feature flags', href: '/admin/feature-flags', permission: 'admin.feature_flag.view', icon: 'flags' }] },
  {
    group: 'Operations',
    items: [
      { label: 'Impersonation', href: '/admin/impersonation', permission: 'admin.impersonation.start', icon: 'impersonate' },
      { label: 'Audit logs', href: '/admin/audit-logs', permission: 'admin.audit.view', icon: 'audit' },
      { label: 'Settings', href: '/admin/settings', permission: 'admin.configuration.view', icon: 'settings' },
    ],
  },
];

export interface RouteMeta {
  title: string;
  subtitle: string;
  showSearch: boolean;
  back?: { href: string; label: string };
}

/**
 * Static route → header metadata, matching Admin.dc.html's own `meta`
 * object. A page's own content shows anything dynamic (a business's actual
 * name); the header only ever needs the generic "what kind of screen is
 * this" title.
 */
export function resolveRouteMeta(pathname: string): RouteMeta {
  const segs = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
  const [root, sub] = segs;

  if (!root) return { title: 'Dashboard', subtitle: 'Platform health across all of Growza.', showSearch: false };

  switch (root) {
    case 'businesses':
      return sub
        ? { title: 'Business detail', subtitle: 'Full support view for this account.', showSearch: false, back: { href: '/admin/businesses', label: 'Businesses' } }
        : { title: 'Businesses', subtitle: 'Every business on the platform.', showSearch: true };
    case 'users':
      return { title: 'Platform users', subtitle: 'Growza admin & platform accounts.', showSearch: false };
    case 'roles':
      return { title: 'Roles & permissions', subtitle: 'Platform and business RBAC.', showSearch: false };
    case 'plans':
      if (sub === 'new') return { title: 'Create plan', subtitle: 'Define pricing, entitlements and features.', showSearch: false, back: { href: '/admin/plans', label: 'Plans' } };
      return sub
        ? { title: 'Edit plan', subtitle: 'Define pricing, entitlements and features.', showSearch: false, back: { href: '/admin/plans', label: 'Plans' } }
        : { title: 'Plans', subtitle: 'What Growza sells.', showSearch: false };
    case 'subscriptions':
      return sub
        // Lifecycle history (GRW-84's dunning/lifecycle machine) is the one
        // thing genuinely not here yet — everything else this subtitle now
        // names (pricing, billing period, entitlements) shipped with GRW-112.
        ? { title: 'Subscription detail', subtitle: 'Pricing, billing period and entitlements.', showSearch: false, back: { href: '/admin/subscriptions', label: 'Subscriptions' } }
        : { title: 'Subscriptions', subtitle: 'What each business currently has.', showSearch: true };
    case 'payments':
      return { title: 'Payments', subtitle: 'Provider payment events.', showSearch: true };
    case 'invoices':
      return { title: 'Invoices', subtitle: 'Billing documents with tax breakdown.', showSearch: true };
    case 'usage':
      return { title: 'Usage', subtitle: 'Bookings, WhatsApp and future AI.', showSearch: true };
    case 'feature-flags':
      return sub
        ? { title: 'Feature flag', subtitle: 'Global, plan and business targeting.', showSearch: false, back: { href: '/admin/feature-flags', label: 'Feature flags' } }
        : { title: 'Feature flags', subtitle: 'Enable capabilities independent of pricing.', showSearch: false };
    case 'impersonation':
      return { title: 'Impersonation', subtitle: 'Controlled support sessions.', showSearch: false };
    case 'audit-logs':
      // GRW-99 replaced the header's free-text search with its own structured
      // filter bar (admin/action/entity/business/date range) — a global
      // search box that only searched the currently-loaded page would have
      // been a dead control against a server-paginated list.
      return { title: 'Audit logs', subtitle: 'Every sensitive admin action.', showSearch: false };
    case 'settings':
      return { title: 'Settings', subtitle: 'Platform configuration.', showSearch: false };
    default:
      return { title: 'Admin', subtitle: '', showSearch: false };
  }
}

/** Which nav item should read as active for a given pathname — detail pages roll up to their list. */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

/**
 * Jira GRW-88 · GRW-171 — the first screen this administrator can actually
 * open.
 *
 * Everybody landed on `/admin` after signing in, and the Dashboard needs
 * `admin.dashboard.view`. A Support administrator without it arrived on a
 * permission error whose only control was a **Retry that could never
 * succeed** — the permission was not going to change between clicks. Their
 * sidebar meanwhile listed the screens they could open, which made the dead
 * page look like an outage rather than a landing they were never meant to
 * have.
 *
 * `null` when their permissions open nothing at all. That is a real state — a
 * role can be created holding nothing (GRW-134) — and it needs a different
 * answer from "go here", so it is not collapsed into a default route.
 */
export function firstPermittedHref(permissions: readonly string[]): string | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (permissions.includes(item.permission)) return item.href;
    }
  }
  return null;
}

/**
 * Jira GRW-267 · GRW-272 — the phone's bottom bar: four screens, then More.
 *
 * Chosen by the owner from the ones an admin opens most on the move. Everything
 * else stays one tap away in the full menu More opens. Each entry is looked up
 * in NAV_GROUPS rather than restated, so the icon, the label's source and — most
 * of all — the permission that hides it cannot drift from the sidebar's.
 */
export const BOTTOM_NAV: { href: string; label: string }[] = [
  { href: '/admin', label: 'Home' },
  { href: '/admin/businesses', label: 'Businesses' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
  { href: '/admin/invoices', label: 'Invoices' },
];

/** The bottom bar's tabs this admin may open, in bar order. `null` permissions = /me not answered yet. */
export function bottomNavItems(permissions: readonly string[] | null, showAll: boolean): (NavItem & { short: string })[] {
  const all = NAV_GROUPS.flatMap((grp) => grp.items);
  return BOTTOM_NAV.flatMap(({ href, label }) => {
    const item = all.find((i) => i.href === href);
    if (!item) return [];
    if (!showAll && !(permissions?.includes(item.permission) ?? false)) return [];
    return [{ ...item, short: label }];
  });
}
