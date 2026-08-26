'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { BottomNav } from './BottomNav';
import { tomorrowInTimezone } from '../lib/appointment-display';
import { IconCalendarPlus, IconClose, IconPlus, IconUserPlus } from './icons';

/**
 * The fixed mobile furniture: tab bar everywhere, plus the floating booking
 * button on the screens where creating a booking is a plausible next move.
 * Hidden inside the booking flow itself (you're already there) and on
 * search, where it would sit on top of results.
 */
// /offers has its own primary "+ Create a new combo" action — a second,
// functionally-unrelated "New booking" FAB floating on top of it is
// confusing, not helpful, the same reasoning that excludes /search.
const NO_FAB = ['/availability', '/search', '/try-whatsapp', '/offers'];

/**
 * Full-screen edit forms with their own pinned primary button — the FAB would
 * float directly on top of "Save changes". Matched as a pattern rather than a
 * NO_FAB prefix because `/providers` (the roster) SHOULD keep the FAB; only
 * `/providers/<id>` should not.
 */
const EDIT_ROUTE_RE = /^\/providers\/[^/]+$/;

export function MobileChrome({ labels, timezone }: { labels: Record<string, string>; timezone: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const showFab = !NO_FAB.some((p) => pathname.startsWith(p)) && !EDIT_ROUTE_RE.test(pathname);

  const close = () => setOpen(false);

  return (
    <>
      {showFab && open && <div className="fab-backdrop" onClick={close} />}

      {showFab && open && (
        <div className="fab-menu">
          {/* A walk-in IS a booking that starts now, so this is the same
              screen as "Book for later" — just today's date, no detour
              through a separate walk-in-only flow. */}
          <a className="fab-menu-item" href="/availability?intent=book" onClick={close}>
            <span className="fab-menu-label">Walk-in now</span>
            <span className="fab-menu-icon">
              <IconUserPlus />
            </span>
          </a>
          <a
            className="fab-menu-item"
            href={`/availability?intent=book&date=${tomorrowInTimezone(timezone)}`}
            onClick={close}
          >
            <span className="fab-menu-label">Book for later</span>
            <span className="fab-menu-icon">
              <IconCalendarPlus />
            </span>
          </a>
        </div>
      )}

      {showFab && (
        <button
          type="button"
          className="fab"
          aria-label={open ? 'Close' : 'New booking'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <IconClose /> : <IconPlus />}
        </button>
      )}

      <BottomNav labels={labels} />
    </>
  );
}
