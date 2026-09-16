'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { adminFetch, AdminApiError } from '../lib/api';
import { clearAdminSession } from '../lib/session';
import { NAV_GROUPS, isNavItemActive, resolveRouteMeta } from '../nav';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { NotificationBell } from './NotificationBell';
import { oklch } from '../tokens';
import { useImpersonation } from './ImpersonationContext';
import { useAdminSearch } from './SearchContext';

interface Me {
  /** GRW-202 — `phone` and `roleName` so the account panel can name the role and the credential. */
  admin: { id: string; name: string; phone: string | null; roleName: string | null };
  permissions: string[];
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * The admin shell (GRW-95): sidebar, header, mobile drawer, impersonation
 * banner. One instance, composed around every /admin page from
 * admin/layout.tsx — no screen builds its own nav or header.
 *
 * GRW-273 added a bottom tab bar (Home / Businesses / More) below the mobile
 * breakpoint, in normal flow as the last child of `main` rather than the
 * header hamburger it replaces — see the comment at the `<nav
 * className="admin-bottom-nav">` below for why. "Reports" from the original
 * design mockup isn't a tab: nothing in `NAV_GROUPS` answers to that name
 * today (the closest real screen is Usage), so it was dropped rather than
 * pointed at a screen it doesn't mean.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [me, setMe] = useState<Me['admin'] | null>(null);
  // Null until /me answers — the nav renders nothing rather than flashing
  // items the admin may not be allowed to see.
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [meError, setMeError] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { session: impersonation, exit: exitImpersonation } = useImpersonation();
  const { query, setQuery } = useAdminSearch();
  const meta = resolveRouteMeta(pathname);

  // GRW-94's own rule: "Navigation is never the control — /me returns the
  // resolved permission set so the dashboard can hide what an admin cannot
  // use." That was built server-side and never wired here, so every admin was
  // offered all twelve screens and found out which ones they could open by
  // clicking and reading an error.
  // If /me could not be read, show the whole nav rather than none of it: the
  // endpoints all refuse independently, so an over-generous sidebar is a
  // wrong-looking link, while an empty one is an admin who cannot work at all
  // and has no idea why.
  // Three states, not two. `permissions === null` means /me has not answered
  // YET — it does not mean "this admin may see nothing", and collapsing the
  // two is what made the sidebar render zero links for the ~45ms between
  // domInteractive and /me resolving. The page looked finished, the nav
  // looked like a nav, and clicking where "Businesses" should be did nothing
  // because there was no link there to click. Measured on a warm local dev
  // server; the window stretches with a cold route compile or a slow /me,
  // which is when a human actually hits it.
  const navLoading = permissions === null && !meError;
  const visibleNavGroups = (meError ? NAV_GROUPS : NAV_GROUPS.map((grp) => ({
    ...grp,
    items: grp.items.filter((item) => permissions?.includes(item.permission) ?? false),
  }))).filter((grp) => grp.items.length > 0);

  // Close the mobile drawer on every navigation so a tap-through doesn't
  // leave it hanging open behind the new screen.
  useEffect(() => setNavOpen(false), [pathname]);

  // GRW-93: the identity shown here is the admin actually signed in, not
  // the design canvas's fixed mock person — a stale name next to a real
  // sign-out control would be its own small QA finding.
  useEffect(() => {
    let cancelled = false;
    adminFetch<Me>('/me')
      .then((result) => {
        if (cancelled) return;
        setMe(result.admin);
        setPermissions(result.permissions);
      })
      .catch((err) => {
        if (cancelled) return;
        // A 401 is genuinely handled elsewhere — SessionGate guarantees a
        // session before this mounts, and adminFetch redirects on expiry. Any
        // OTHER failure used to be swallowed entirely, which left the sidebar
        // stuck on "Loading…" with blank initials and no explanation. That
        // matters more now the nav itself is built from this response: a
        // network blip would render an empty portal that looks like a
        // permissions problem.
        if (err instanceof AdminApiError && err.status === 401) return;
        setMeError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await adminFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Sign out client-side regardless — there is no server-side session
      // to fail to clear (stateless bearer tokens; see the route's own
      // comment), so a failed request here is never a reason to leave the
      // admin stuck signed in.
    } finally {
      clearAdminSession();
      router.push('/admin/login');
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', position: 'relative' }}>
      <aside className="admin-sidebar" data-open={navOpen}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 8px' }}>
          <button
            type="button"
            onClick={() => setChangingPassword(true)}
            aria-label="Your account"
            title="Your account"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'oklch(0.97 0.01 150)',
              color: 'oklch(0.34 0.08 155)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 19,
              flex: 'none',
              // GRW-203 — was a <div>. It looks like an account button on every
              // other product and did nothing when clicked.
              border: 'none',
              cursor: 'pointer',
            }}
          >
            G
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>Growza</div>
            <div style={{ fontSize: 11.5, color: oklch.sidebarTextFaint }}>Platform team</div>
          </div>
          <button
            type="button"
            className="admin-sidebar-close"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            style={{
              marginLeft: 'auto',
              width: 32,
              height: 32,
              borderRadius: 9,
              border: 'none',
              background: 'oklch(1 0 0 / 0.1)',
              color: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="close" size={17} />
          </button>
        </div>

        <nav
          aria-busy={navLoading}
          style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 16, overflowY: 'auto', flex: 1, paddingRight: 2 }}
        >
          {/*
            While /me is in flight, show the nav's SHAPE rather than nothing:
            group headings and inert placeholder rows, sized like the real
            ones so the sidebar does not jump when they resolve. Deliberately
            not clickable and aria-hidden — an admin cannot navigate yet, and
            a placeholder that looked like a link would recreate the original
            bug with better styling. Which items they may actually see is
            still decided by /me; this only stops the gap reading as an empty,
            finished sidebar.
          */}
          {navLoading &&
            NAV_GROUPS.map((grp) => (
              <div key={grp.group} aria-hidden>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: 'oklch(0.62 0.04 150)',
                    padding: '14px 13px 6px',
                  }}
                >
                  {grp.group}
                </div>
                {grp.items.map((item) => (
                  <div
                    key={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 13px',
                      borderRadius: 11,
                      fontSize: 14,
                    }}
                  >
                    <span style={{ display: 'flex', opacity: 0.25 }}>
                      <Icon name={item.icon} />
                    </span>
                    <span
                      style={{
                        height: 9,
                        width: `${Math.min(148, 56 + item.label.length * 6)}px`,
                        borderRadius: 5,
                        background: 'oklch(1 0 0 / 0.13)',
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          {visibleNavGroups.map((grp) => (
            <div key={grp.group}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: 'oklch(0.62 0.04 150)',
                  padding: '14px 13px 6px',
                }}
              >
                {grp.group}
              </div>
              {grp.items.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 13px',
                      borderRadius: 11,
                      cursor: 'pointer',
                      fontSize: 14,
                      ...(active
                        ? {
                            background: oklch.sidebarActiveBg,
                            color: oklch.sidebarActiveText,
                            fontWeight: 700,
                            boxShadow: '0 4px 14px oklch(0.15 0.04 160 / 0.3)',
                          }
                        : { color: oklch.sidebarText, fontWeight: 500 }),
                    }}
                  >
                    <span style={{ display: 'flex' }}>
                      <Icon name={item.icon} />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: 12,
            borderRadius: 13,
            background: 'oklch(1 0 0 / 0.06)',
            border: '1px solid oklch(1 0 0 / 0.08)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'oklch(0.6 0.13 150)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              flex: 'none',
            }}
          >
            {me ? initialsOf(me.name) : ''}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {me?.name ?? 'Loading…'}
            </div>
            {/* GRW-202 — the ROLE, which is what somebody checks here, and the
                number they sign in with (GRW-198). The email sat in this slot
                and is neither: it is a contact detail this product never
                authenticates with. */}
            <div style={{ fontSize: 11, color: oklch.sidebarTextFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {me?.roleName ?? (me ? 'No role assigned' : '')}
            </div>
            {me?.phone && (
              <div style={{ fontSize: 11, color: oklch.sidebarTextFaint, fontVariantNumeric: 'tabular-nums' }}>
                {me.phone}
              </div>
            )}
            {me && (
              <button
                type="button"
                onClick={() => setChangingPassword(true)}
                style={{
                  marginTop: 4,
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  color: oklch.sidebarText,
                  font: 'inherit',
                  fontSize: 11,
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Change password
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              border: 'none',
              background: 'oklch(1 0 0 / 0.1)',
              color: oklch.sidebarText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: signingOut ? 'not-allowed' : 'pointer',
              opacity: signingOut ? 0.6 : 1,
              flex: 'none',
            }}
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
      <div className="admin-nav-scrim" data-open={navOpen} onClick={() => setNavOpen(false)} />

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {impersonation ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '11px 24px',
              background: 'oklch(0.5 0.16 25)',
              color: 'white',
              flexWrap: 'wrap',
            }}
          >
            <Icon name="impersonate" size={19} />
            <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '0.01em' }}>
              IMPERSONATING · {impersonation.business} · {impersonation.user}
            </div>
            <span style={{ fontSize: 12.5, color: 'oklch(0.92 0.05 25)', fontWeight: 500 }}>
              Reason: {impersonation.reason}. All actions are logged to the audit trail.
            </span>
            <button
              type="button"
              onClick={exitImpersonation}
              style={{
                marginLeft: 'auto',
                height: 32,
                padding: '0 15px',
                borderRadius: 9,
                border: '1px solid oklch(1 0 0 / 0.5)',
                background: 'oklch(1 0 0 / 0.14)',
                color: 'white',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Exit impersonation
            </button>
          </div>
        ) : null}

        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'oklch(0.97 0.005 150 / 0.88)',
            backdropFilter: 'blur(10px)',
            borderBottom: `1px solid ${oklch.border}`,
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div className="admin-header-title" style={{ minWidth: 0, flex: 1 }}>
            {meta.back ? (
              <button
                type="button"
                onClick={() => router.push(meta.back!.href)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginBottom: 3,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: oklch.accent,
                }}
              >
                <Icon name="chevronLeft" size={14} />
                {meta.back.label}
              </button>
            ) : null}
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: oklch.textStrong,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {meta.title}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: oklch.textMuted }}>{meta.subtitle}</p>
          </div>
          {/*
            GRW-277 QA — the bell is its own header child, not grouped with the
            search box.

            Grouped, the pair had to wrap as one: a search box needs the whole
            line on a phone, so the bell was dragged down with it onto a line
            of its own, sitting under the title with nothing beside it. Apart,
            each wraps on its own terms — the bell stays up on the title's line
            where a notification control is looked for, and only the search box
            takes a second line. `order` in `admin.css` keeps the laptop
            arrangement (search, then bell) that the DOM order here reverses.
          */}
          <div className="admin-header-bell">
            <NotificationBell />
          </div>
          {meta.showSearch ? (
            <div className="admin-search-wrap" style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'oklch(0.6 0.02 155)',
                  display: 'flex',
                }}
              >
                <Icon name="search" size={16} />
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="admin-search-input"
                style={{
                  width: 260,
                  height: 40,
                  padding: '0 14px 0 38px',
                  borderRadius: 11,
                  border: `1px solid ${oklch.borderStrong}`,
                  background: 'white',
                  fontSize: 14,
                  fontWeight: 500,
                  outline: 'none',
                }}
              />
            </div>
          ) : null}
        </header>

        <div style={{ padding: 24, flex: 1, animation: 'admin-fade 0.25s ease' }}>{children}</div>

        {/*
          Jira GRW-273 — replaces the header hamburger on mobile rather than
          sitting alongside it: two controls that both open the same drawer
          would leave an admin guessing which one does what. "More" opens
          that same drawer (`navOpen`/`setNavOpen`, unchanged) for the 10 nav
          items that don't get their own tab — this bar doesn't duplicate the
          drawer, it's a second way into it plus 2 shortcuts.

          `position: sticky` rather than `fixed`, on purpose: the tenant
          portal's own bottom nav (74-mobile-chrome-2026.css) documents a real
          Android Chrome bug where a fixed bar stays pinned to the stale
          layout viewport when the address bar auto-hides, leaving a gap of
          raw page background beneath it. Sticky recomputes against the live
          viewport on every scroll, so it doesn't have that failure mode, and
          the root shell's own `minHeight: 100vh` (with default flex stretch)
          already guarantees `main` is tall enough for "sticky to the bottom"
          to mean the actual bottom of the screen even on a short page.
        */}
        <nav className="admin-bottom-nav" aria-label="Primary">
          <Link href="/admin" className={isNavItemActive(pathname, '/admin') ? 'active' : undefined} aria-current={isNavItemActive(pathname, '/admin') ? 'page' : undefined}>
            <Icon name="dashboard" size={20} />
            <span>Home</span>
          </Link>
          <Link
            href="/admin/businesses"
            className={isNavItemActive(pathname, '/admin/businesses') ? 'active' : undefined}
            aria-current={isNavItemActive(pathname, '/admin/businesses') ? 'page' : undefined}
          >
            <Icon name="businesses" size={20} />
            <span>Businesses</span>
          </Link>
          <button type="button" className={navOpen ? 'active' : undefined} onClick={() => setNavOpen(true)} aria-haspopup="true" aria-expanded={navOpen}>
            <Icon name="menu" size={20} />
            <span>More</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
