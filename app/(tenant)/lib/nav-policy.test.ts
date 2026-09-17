import { describe, expect, it } from 'vitest';
import { canSee, canSeeRevenue, homeKind, visibleItems } from './nav-policy';
// GRW-171 — the API's allowlist as a VALUE. Previously regexed out of the
// source file, which broke the moment that file moved into src/api/security/.
import { STAFF_ALLOWED } from '../../../../src/api/security/tenant-policy';

/**
 * Jira GRW-66 · GRW-157 — the dashboard offers a stylist what they can use.
 *
 * GRW-156 made the API refuse; this is the courtesy half. The tests that matter
 * most are the two at the bottom: that an unknown role renders as OWNER, and
 * that this list agrees with the API's.
 */
const NAV = [
  { href: '/' },
  { href: '/appointments' },
  { href: '/providers' },
  { href: '/services' },
  { href: '/offers' },
  { href: '/customers' },
  // GRW-169/200 — a real destination for the receptionist and, read-only, for
  // a stylist looking at their own record.
  { href: '/attendance' },
  // Jira GRW-301 — a real destination for both limited roles now, scoped by
  // `staffProviderScope` for a stylist and unscoped for a receptionist.
  { href: '/notifications' },
  { href: '/reports' },
  { href: '/availability' },
  { href: '/try-whatsapp' },
  { href: '/settings' },
  { href: '/more' },
];

describe('AC-01 — a stylist is offered what they can use', () => {
  it('their appointments, and nothing else', () => {
    /**
     * `/more` earns its place back in GRW-160 and only there: it was removed
     * (GRW-158) because every row on it was owner-only and it rendered EMPTY
     * for a stylist. It now carries sign-out, outside the policy filter.
     */
    expect(visibleItems(NAV, 'staff').map((i) => i.href)).toEqual([
      // Jira GRW-222 — their own Home, built from the reads below.
      '/',
      '/appointments',
      // GRW-200 — their own record, read-only. The API scopes it to them and
      // refuses both writes, so this is a place to look and not to edit.
      '/attendance',
      // Jira GRW-301 — their own confirmations/cancellations/reschedules,
      // scoped by `staffProviderScope` the same way `/attendance` is.
      '/notifications',
      '/more',
    ]);
  });

  it('a menu that has something on it for them — sign-out (GRW-160)', () => {
    // The test that used to assert the opposite. Changing it is the point of
    // the story, not an inconvenience it caused: a stylist on a shared salon
    // device is the person who most needs to be able to end their session.
    expect(canSee('/more', 'staff')).toBe(true);
  });

  it('their own Home, which shows their day and not the salon’s takings (Jira GRW-222)', () => {
    expect(canSee('/', 'staff')).toBe(true);
    expect(homeKind('staff')).toBe('stylist');
  });

  it('and not the money', () => {
    expect(canSeeRevenue('staff')).toBe(false);
  });
});

describe('AC-02 / AC-04 — everyone else is unchanged', () => {
  it('an owner keeps every item, in order', () => {
    expect(visibleItems(NAV, 'owner')).toEqual(NAV);
  });

  it('a manager keeps every item — headroom, treated as owner', () => {
    expect(visibleItems(NAV, 'manager')).toEqual(NAV);
  });

  it('AC-04 — an UNKNOWN role renders as owner, not as nothing', () => {
    /**
     * BR-03, and the failure this ordering exists to avoid. `null` means the
     * API was unreachable or a dev session had no token — and hiding half the
     * product from the person who owns it, because a request failed, would be a
     * worse bug than the one this story fixes.
     */
    expect(visibleItems(NAV, null)).toEqual(NAV);
    expect(visibleItems(NAV, undefined)).toEqual(NAV);
    expect(canSeeRevenue(null)).toBe(true);
  });
});

describe('AC-05 / BR-02 — the nav agrees with the API', () => {
  it('every destination a stylist is offered is one the API would serve', () => {
    /**
     * Two lists in two languages that have to agree. Compared here rather than
     * left to somebody remembering: a nav entry the API refuses is a link that
     * 403s, which is the exact thing this story exists to remove.
     */
    const staffAllowed = [...STAFF_ALLOWED]
      .filter((entry) => entry.startsWith('GET '))
      .map((entry) => entry.slice('GET '.length));
    expect(staffAllowed.length, 'the API allowlist was not parsed').toBeGreaterThan(3);

    // `/more` is a client-side menu with no endpoint of its own; every other
    // destination must have a route a stylist may call.
    for (const { href } of visibleItems(NAV, 'staff')) {
      // `/` is Home, which has no endpoint of its own either: a stylist's Home
      // reads `/appointments`, `/provider-day`, `/attendance` and `/my-earnings`.
      if (href === '/more' || href === '/') continue;
      expect(staffAllowed, `${href} is offered in the nav`).toContain(`/api/v1${href}`);
    }
  });

  it('and the API does NOT open anything the nav quietly hides', () => {
    // The reverse direction is a smell rather than a bug: a route staff may
    // call with no way to reach it is dead permission. Asserted so that adding
    // one is a decision.
    const staffAllowed = [...STAFF_ALLOWED]
      .filter((entry) => entry.startsWith('GET '))
      .map((entry) => entry.slice('GET '.length));
    // These are data the scoped pages need, not destinations of their own.
    const supporting = [
      '/api/v1/me', '/api/v1/services', '/api/v1/services/all', '/api/v1/service-categories',
      '/api/v1/offers', '/api/v1/offers/all', '/api/v1/offers/:id', '/api/v1/providers',
      '/api/v1/provider-day', '/api/v1/capacity',
      /*
       * Jira GRW-216 — read by the Bookings screen, which IS a stylist's nav
       * destination; it is not a page of its own. Stated here rather than left
       * to fail, which is what this assertion is for: a route granted with no
       * way to reach it is dead permission, and the last one removed from this
       * allowlist (`POST /customers`) came out for exactly that.
       */
      '/api/v1/my-earnings',
    ];
    const unexplained = staffAllowed.filter((r) => !supporting.includes(r) && !visibleItems(NAV, 'staff').some((i) => `/api/v1${i.href}` === r));
    expect(unexplained, 'staff-allowed routes with no nav destination and no stated reason').toEqual([]);
  });
});
