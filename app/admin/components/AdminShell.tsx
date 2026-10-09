'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { adminFetch } from '../lib/api';
import { clearAdminSession } from '../lib/session';
import { BROWSER_BACK, NAV_GROUPS, bottomNavItems, isNavItemActive, resolveRouteMeta } from '../nav';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { NotificationBell } from './NotificationBell';
import { oklch } from '../tokens';
import { useImpersonation } from './ImpersonationContext';
import { useAdminSearch } from './SearchContext';
import { useAdminMe } from './AdminMeContext';


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
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  // Batch D — /me comes from AdminMeProvider (SessionGate), shared with every screen, instead of a fetch of its own.
  const { state: meState } = useAdminMe();
  const me = meState.status === 'ready' ? meState.me.admin : null;
  // Null until /me answers — the nav renders nothing rather than flashing
  // items the admin may not be allowed to see.
  const permissions = meState.status === 'ready' ? meState.me.permissions : null;
  // A 401 is handled by adminFetch's own sign-out; any other failure shows the whole nav (see below).
  const meError = meState.status === 'error' && !meState.unauthorised;
  const [changingPassword, setChangingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
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

  /**
   * Jira GRW-267 · GRW-272 — the phone's bottom bar, filtered by the same /me
   * answer as the sidebar. Empty while /me is in flight rather than guessing:
   * More is always there, and it opens a drawer that shows its own loading
   * shape.
   */
  const bottomTabs = navLoading ? [] : bottomNavItems(permissions, meError);

  // Close the mobile drawer on every navigation so a tap-through doesn't
  // leave it hanging open behind the new screen.
  useEffect(() => setNavOpen(false), [pathname]);

  // GRW-93: the identity shown here is the admin actually signed in, not the design canvas's fixed mock person. A
  // non-401 /me failure used to be swallowed, leaving the sidebar stuck on "Loading…"; the provider now records it
  // as `error`, and the nav shows everything rather than nothing (see above).

  /**
   * Admin audit 2026-10-09, M9 — sign-out has to reach the server, or it has not happened.
   *
   * This used to clear the screen whatever the request did, on the reasoning that there was no server session to
   * end. There is (GRW-480 stamps the sign-out and revokes the refresh token) and, more to the point, the refresh
   * cookie is HttpOnly — only the server's reply can clear it. A logout that never arrived left it in the browser,
   * and the next visit to /admin renewed from it without asking: "signed out" on a shared computer, still signed
   * in. So a failure now says so and leaves the admin where they are, able to try again.
   */
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await adminFetch('/auth/logout', { method: 'POST' });
    } catch {
      setSignOutError('Could not sign you out — you are still signed in. Check your connection and try again.');
      setSigningOut(false);
      return;
    }
    clearAdminSession();
    router.push('/admin/login');
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
        {signOutError ? (
          <div role="alert" style={{ marginTop: 8, padding: '0 4px', fontSize: 12, lineHeight: 1.45, fontWeight: 600, color: 'oklch(0.86 0.09 40)' }}>
            {signOutError}
          </div>
        ) : null}
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
            <div className="admin-name" style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '0.01em' }}>
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
          className="admin-header"
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
          <div className="admin-header-title" style={{ minWidth: 0 }}>
            {/*
              Jira GRW-300 — Notifications' back button is icon-only, inline
              with the H1 (the same slot the hamburger sits in for a screen
              with no back button), not this text-and-chevron line above the
              title. Every OTHER back-having screen (Business detail, Plan
              edit…) keeps that line as it always has — this is Notifications'
              own header, not a rule about back buttons generally.
            */}
            {meta.back && pathname !== '/admin/notifications' ? (
              <button
                type="button"
                onClick={() => (meta.back!.href === BROWSER_BACK ? router.back() : router.push(meta.back!.href))}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {meta.back && pathname === '/admin/notifications' ? (
                <button
                  type="button"
                  onClick={() => (meta.back!.href === BROWSER_BACK ? router.back() : router.push(meta.back!.href))}
                  aria-label={meta.back.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    border: `1px solid ${oklch.borderStrong}`,
                    background: 'white',
                    color: oklch.textMuted,
                    cursor: 'pointer',
                    flex: 'none',
                  }}
                >
                  <Icon name="chevronLeft" size={18} />
                </button>
              ) : null}
              {/*
                Jira GRW-298 — "More" moves here from the bottom bar, beside
                the heading it now opens alongside, rather than sitting as a
                fifth bottom tab. Admin mobile only: the sidebar already gives
                a laptop this same nav with no drawer needed.

                Jira GRW-300 — not when this screen already has a back button
                (Notifications, Business detail, Plan edit…): a back arrow
                ABOVE the title and a hamburger BESIDE it were two different
                ways to leave the screen on the same header, and the back
                button already answers "how do I leave" for a screen that has
                one. The hamburger is for screens with no way out otherwise.
              */}
              {!meta.back ? (
                <button
                  type="button"
                  className="admin-mobile-only"
                  onClick={() => setNavOpen(true)}
                  aria-label="More"
                  aria-expanded={navOpen}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    border: `1px solid ${oklch.borderStrong}`,
                    background: 'white',
                    color: oklch.textMuted,
                    cursor: 'pointer',
                    flex: 'none',
                  }}
                >
                  <Icon name="menu" size={18} />
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
                  minWidth: 0,
                }}
              >
                {meta.title}
              </h1>
            </div>
            <p className="admin-header-subtitle" style={{ margin: '2px 0 0', fontSize: 13, color: oklch.textMuted }}>{meta.subtitle}</p>
          </div>
          <div className="admin-header-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 11 }}>
            {meta.showSearch ? (
              <div className="admin-header-search" style={{ position: 'relative' }}>
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
                  aria-label="Search"
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
            {/*
              Jira GRW-276 — this was a button with a hardcoded "6" and no
              click handler: a control that looked like it counted something
              and did nothing when pressed. `NotificationBell` owns its own
              read, badges the attention rows that are real and non-zero, and
              renders nothing at all when it cannot read — a bell that cannot
              answer invites a click that never can.

              It keeps `admin-header-bell` on a wrapper because the phone rules
              in admin.css order it against the search box by that class.
            */}
            <div className="admin-header-bell" style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
              <NotificationBell />
            </div>
          </div>
        </header>

        {/*
          Jira GRW-299 — Notifications slides in from the right rather than
          fading in place, so leaving the bottom tab reads as pushing onto a
          stack, not landing on an unrelated page. Every other route keeps the
          plain fade.
        */}
        <div className="admin-content" style={{ padding: 24, flex: 1, animation: pathname === '/admin/notifications' ? 'admin-slide-in-right 0.25s ease' : 'admin-fade 0.25s ease' }}>
          {children}
        </div>
      </main>

      {/*
        Jira GRW-267 · GRW-272 — phones only (admin.css hides it above 860px).
        `bottom-nav` as well as its own class: the install banner (GRW-270)
        measures `.bottom-nav` to sit above whatever bar a screen has.

        Jira GRW-298 — "More" moved to the header instead of sitting here as a
        fifth tab. Jira GRW-299 puts Notifications in that freed slot instead,
        rendered directly (not through `bottomTabs`) since it has no sidebar
        screen in NAV_GROUPS to look an icon/permission up from — gated on
        `admin.dashboard.view` directly, the same permission its own page's
        `/dashboard` read needs.
      */}
      <nav className="admin-bottom-nav bottom-nav" aria-label="Main">
        {bottomTabs.map((tab) => {
          const active = !navOpen && isNavItemActive(pathname, tab.href);
          return (
            <Link key={tab.href} href={tab.href} className="admin-bottom-tab" data-active={active ? 'true' : undefined} aria-current={active ? 'page' : undefined}>
              <span className="admin-bottom-icon">
                <Icon name={tab.icon} size={20} />
              </span>
              <span className="admin-bottom-label">{tab.short}</span>
            </Link>
          );
        })}
        {/* Same fail-open rule `bottomNavItems`/the sidebar apply: an unreadable /me shows every tab rather than none. */}
        {!navLoading && (meError || permissions?.includes('admin.dashboard.view')) ? (
          <Link
            href="/admin/notifications"
            className="admin-bottom-tab"
            data-active={!navOpen && isNavItemActive(pathname, '/admin/notifications') ? 'true' : undefined}
            aria-current={isNavItemActive(pathname, '/admin/notifications') ? 'page' : undefined}
          >
            <span className="admin-bottom-icon">
              <Icon name="bell" size={20} />
            </span>
            <span className="admin-bottom-label">Notifications</span>
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
