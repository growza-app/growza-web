'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Jira GRW-300 — the mobile hamburger drawer's open/closed state.
 *
 * The toggle button and the drawer it opens are different subtrees:
 * `MobileChrome` (which renders the toggle — it's already mounted globally,
 * sibling to `.content`) and `Sidebar` (which becomes the drawer panel on
 * mobile — a sibling of `.content`, not a descendant of it) never otherwise
 * share a parent closer than the layout itself, and the layout is a server
 * component with nowhere to hold `useState`. A context is the bridge, same
 * role `LabelsProvider` plays for `ctx.labels`.
 */
const MobileNavContext = createContext<{ open: boolean; toggle: () => void; close: () => void } | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  /*
   * Owner, 2026-10-15 — the drawer must be shut whenever a screen is shown again.
   *
   * A drawer link is a full page load, and a phone keeps the page it left in its back-forward cache, frozen the way
   * it was: drawer open, scroll locked. Back brought that page straight back, so the ☰ then CLOSED an already-open
   * drawer on its first tap and looked dead ("it gets stuck"). `pageshow` with `persisted` is the one signal a
   * restored page gets. A client-side navigation keeps this provider mounted, so a changed path shuts it too.
   */
  useEffect(() => {
    const restored = (e: PageTransitionEvent) => {
      if (e.persisted) setOpen(false);
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  const value = useMemo(
    () => ({
      open,
      toggle: () => setOpen((v) => !v),
      close: () => setOpen(false),
    }),
    [open],
  );
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

/** Absent a provider (should not happen below the layout), the drawer just never opens rather than crashing the page. */
export function useMobileNav(): { open: boolean; toggle: () => void; close: () => void } {
  return useContext(MobileNavContext) ?? { open: false, toggle: () => {}, close: () => {} };
}
