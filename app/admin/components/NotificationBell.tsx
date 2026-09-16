'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '../icons';
import { adminFetch } from '../lib/api';
import { oklch } from '../tokens';
import type { AttentionRow } from './DashboardParts';

/**
 * Jira GRW-276 — the header bell, ringing about something real.
 *
 * It used to be a hardcoded "6" on a button with no click handler: a control
 * that looked like it counted something and did nothing when pressed. The
 * count is now the dashboard's own attention registry — the rows that both
 * have a real query behind them AND currently have something in them — and
 * the panel lists them, each linking to the screen that can resolve it.
 *
 * Owns its own read rather than taking it from the shell: this is the only
 * thing that needs it outside the dashboard page, and a failed read here must
 * not be able to affect anything else in the header.
 *
 * Renders NOTHING when that read fails — no `admin.dashboard.view`, or the
 * call errored. A bell that cannot tell you anything is worse than no bell:
 * it invites a click that can never answer.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<AttentionRow[] | null>(null);
  const [open, setOpen] = useState(false);
  /** Bumped each time the panel opens, to re-read. */
  const [openCount, setOpenCount] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /*
   * Jira GRW-287 (QA of GRW-276) — re-read on every route change, and every
   * time the panel opens.
   *
   * It read once, when the admin shell mounted, and the shell does not
   * remount as an admin moves between its screens. So the admin who opened
   * the failed payment from the bell, reconciled it, and came back was still
   * told it needed attention — for as long as the tab stayed open. A route
   * change is the moment somebody has plausibly just resolved something, and
   * opening the panel is the moment they are about to trust what it says.
   *
   * Not a timer: the admin plane has nothing that changes while one screen
   * sits open, and the dashboard read is not free. A later read that fails
   * hides the bell, exactly as a first one does (FR-06) — a count that could
   * not be refreshed is not one to keep showing as current.
   */
  useEffect(() => {
    let cancelled = false;
    adminFetch<{ attention: AttentionRow[] }>('/dashboard')
      .then((result) => {
        if (!cancelled) setAlerts(result.attention.filter((row) => row.available));
      })
      .catch(() => {
        if (!cancelled) setAlerts(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, openCount]);

  // Don't leave the panel hanging open behind a screen the admin just opened.
  useEffect(() => setOpen(false), [pathname]);

  /*
   * Jira GRW-287 — Escape closes the panel and puts focus back on the bell,
   * the keyboard's half of "click anywhere else to dismiss". Without the focus
   * return, a keyboard user who dismissed the panel was left focused on
   * nothing and had to tab in again from the top of the page.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!alerts) return null;

  const total = alerts.reduce((sum, row) => sum + (row.count ?? 0), 0);
  const live = alerts.filter((row) => (row.count ?? 0) > 0);

  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        aria-label={total > 0 ? `Notifications, ${total} needing attention` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        ref={buttonRef}
        onClick={() => {
          if (!open) setOpenCount((n) => n + 1);
          setOpen(!open);
        }}
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
        }}
      >
        <Icon name="bell" size={18} />
        {/* No badge at zero — a "0" bubble is a permanent small alarm about nothing. */}
        {total > 0 ? (
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
            {total > 99 ? '99+' : total}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Click-anywhere-else to dismiss, without a visible scrim. */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div
            style={{
              position: 'absolute',
              top: 48,
              right: 0,
              zIndex: 21,
              width: 288,
              maxWidth: 'calc(100vw - 32px)',
              background: 'white',
              border: `1px solid ${oklch.border}`,
              borderRadius: 14,
              boxShadow: '0 12px 32px oklch(0.2 0.02 155 / 0.16)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '11px 14px',
                borderBottom: `1px solid ${oklch.divider}`,
                fontSize: 12.5,
                fontWeight: 800,
                color: oklch.textStrong,
              }}
            >
              Needs attention
            </div>
            {live.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 13, color: oklch.textFaint }}>Nothing needs attention right now.</div>
            ) : (
              live.map((row) => (
                <Link
                  key={row.key}
                  href={row.href ?? '/admin'}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 14px',
                    borderBottom: `1px solid ${oklch.divider}`,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9,
                      background: 'oklch(0.95 0.04 25)',
                      color: 'oklch(0.5 0.14 25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    <Icon name="alert" size={15} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: oklch.textStrong }}>{row.label}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'oklch(0.5 0.14 25)' }}>{row.count}</span>
                </Link>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
