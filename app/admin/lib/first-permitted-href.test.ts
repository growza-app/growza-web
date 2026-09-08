import { describe, expect, it } from 'vitest';
import { firstPermittedHref, NAV_GROUPS } from '../nav';

/**
 * Jira GRW-88 · GRW-171 — a landing page somebody can actually open.
 *
 * Sign-in sends everyone to `/admin`, whose Dashboard needs
 * `admin.dashboard.view`. A Support administrator without it arrived on a
 * permission error offering a **Retry that could never succeed** — the
 * permission was not going to change between clicks — while their own sidebar
 * listed screens they could open. The dead page read as an outage rather than
 * a landing they were never meant to have.
 */
describe('firstPermittedHref', () => {
  it('sends a dashboard-less admin to their first real screen', () => {
    expect(firstPermittedHref(['admin.business.view'])).toBe('/admin/businesses');
  });

  it('prefers the dashboard when they can see it, so nobody is moved unnecessarily', () => {
    expect(firstPermittedHref(['admin.dashboard.view', 'admin.business.view'])).toBe('/admin');
  });

  it('follows the sidebar’s own order rather than an order of its own', () => {
    /**
     * The two lists have to agree: sending somebody to a screen that is not the
     * first one in their sidebar is a landing that looks like a mis-click.
     */
    const permitted = ['admin.plan.view', 'admin.business.view'];
    const firstInNav = NAV_GROUPS.flatMap((g) => g.items).find((i) => permitted.includes(i.permission));
    expect(firstPermittedHref(permitted)).toBe(firstInNav?.href);
  });

  it('answers null when the role opens nothing — a real state, not a default route', () => {
    /**
     * A role can be created holding no permissions at all (GRW-134). "Go
     * nowhere" needs a different answer from "go here", so it must not
     * collapse into a fallback that sends them somewhere they will be refused
     * again.
     */
    expect(firstPermittedHref([])).toBeNull();
    expect(firstPermittedHref(['admin.something.invented'])).toBeNull();
  });

  it('every nav item names a permission, or the filter silently hides it', () => {
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      expect(item.permission, `${item.href} has no permission`).toBeTruthy();
    }
  });
});
