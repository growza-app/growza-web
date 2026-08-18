'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { BottomNav } from './BottomNav';
import { IconCalendarPlus, IconClose, IconPlus, IconUserPlus } from './icons';

/**
 * The fixed mobile furniture: tab bar everywhere, plus the floating booking
 * button on the screens where creating a booking is a plausible next move.
 * Hidden inside the booking flow itself (you're already there) and on
 * search, where it would sit on top of results.
 */
const NO_FAB = ['/availability', '/search', '/try-whatsapp'];

/** Tomorrow's date in the tenant's own timezone, not the device's — matches how every other date in this dashboard is computed. */
function tomorrowInTimezone(timezone: string): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(tomorrow);
}

export function MobileChrome({ labels, timezone }: { labels: Record<string, string>; timezone: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const showFab = !NO_FAB.some((p) => pathname.startsWith(p));

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
