'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

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
