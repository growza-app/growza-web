import type { IconName } from './icons';

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
}
export interface NavGroup {
  group: string;
  items: NavItem[];
}

/** The admin sidebar, grouped exactly as Admin.dc.html groups it. */
export const NAV_GROUPS: NavGroup[] = [
  { group: 'Overview', items: [{ label: 'Dashboard', href: '/admin', icon: 'dashboard' }] },
  {
    group: 'Platform',
    items: [
      { label: 'Businesses', href: '/admin/businesses', icon: 'businesses' },
      { label: 'Platform users', href: '/admin/users', icon: 'users' },
      { label: 'Roles & permissions', href: '/admin/roles', icon: 'roles' },
    ],
  },
  {
    group: 'Billing',
    items: [
      { label: 'Plans', href: '/admin/plans', icon: 'plans' },
      { label: 'Subscriptions', href: '/admin/subscriptions', icon: 'subs' },
      { label: 'Payments', href: '/admin/payments', icon: 'payments' },
      { label: 'Invoices', href: '/admin/invoices', icon: 'invoices' },
      { label: 'Usage', href: '/admin/usage', icon: 'usage' },
    ],
  },
  { group: 'Control', items: [{ label: 'Feature flags', href: '/admin/feature-flags', icon: 'flags' }] },
  {
    group: 'Operations',
    items: [
      { label: 'Impersonation', href: '/admin/impersonation', icon: 'impersonate' },
      { label: 'Audit logs', href: '/admin/audit-logs', icon: 'audit' },
      { label: 'Settings', href: '/admin/settings', icon: 'settings' },
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
        ? { title: 'Subscription detail', subtitle: 'Pricing, entitlements and lifecycle.', showSearch: false, back: { href: '/admin/subscriptions', label: 'Subscriptions' } }
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
