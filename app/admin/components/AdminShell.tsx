'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { adminFetch } from '../lib/api';
import { clearAdminSession } from '../lib/session';
import { NAV_GROUPS, isNavItemActive, resolveRouteMeta } from '../nav';
import { oklch } from '../tokens';
import { useImpersonation } from './ImpersonationContext';
import { useAdminSearch } from './SearchContext';

interface Me {
  admin: { id: string; email: string; name: string };
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
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [me, setMe] = useState<Me['admin'] | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const { session: impersonation, exit: exitImpersonation } = useImpersonation();
  const { query, setQuery } = useAdminSearch();
  const meta = resolveRouteMeta(pathname);

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
        if (!cancelled) setMe(result.admin);
      })
      .catch(() => {
        // SessionGate already guarantees a session exists before this
        // mounts; a failure here means the token died between then and
        // now, and adminFetch's own 401 handling is already redirecting.
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
          <div
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
            }}
          >
            G
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>Growza</div>
            <div style={{ fontSize: 11.5, color: oklch.sidebarTextFaint }}>Super admin</div>
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

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 16, overflowY: 'auto', flex: 1, paddingRight: 2 }}>
          {NAV_GROUPS.map((grp) => (
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
            <div style={{ fontSize: 11, color: oklch.sidebarTextFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {me?.email ?? ''}
            </div>
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
          <button
            type="button"
            className="admin-mobile-only"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              border: `1px solid ${oklch.border}`,
              background: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'oklch(0.3 0.02 155)',
              cursor: 'pointer',
              flex: 'none',
            }}
          >
            <Icon name="menu" size={20} />
          </button>
          <div style={{ minWidth: 0 }}>
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
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 11 }}>
            {meta.showSearch ? (
              <div style={{ position: 'relative' }}>
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
            <button
              type="button"
              aria-label="Notifications"
              style={{
                position: 'relative',
                width: 40,
                height: 40,
                borderRadius: 11,
                border: `1px solid ${oklch.border}`,
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'oklch(0.45 0.02 155)',
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              <Icon name="bell" size={18} />
              <span
                style={{
                  position: 'absolute',
                  top: -5,
                  right: -5,
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 9,
                  background: 'oklch(0.55 0.19 25)',
                  color: 'white',
                  fontSize: 10.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid oklch(0.97 0.005 150)',
                }}
              >
                6
              </span>
            </button>
          </div>
        </header>

        <div style={{ padding: 24, flex: 1, animation: 'admin-fade 0.25s ease' }}>{children}</div>
      </main>
    </div>
  );
}
