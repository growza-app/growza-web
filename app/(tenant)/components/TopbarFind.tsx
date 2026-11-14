'use client';

import { usePathname } from 'next/navigation';
import { HeaderSearch } from './HeaderSearch';

/**
 * Emerald v3 (owner, 14 Nov 2026: "fix all" — one header on every laptop screen) — the wide "Find a guest" pill
 * in the header bar of every screen, as Home has it. CSS shows it at 861px and up only; a phone is unchanged.
 *
 * Not on Search (it IS the search) nor on the guest list, whose own box finds the same people: two boxes that
 * find guests on one screen is the confusion GRW-448 took the header magnifier away for.
 */
const OWN_SEARCH = ['/search', '/customers'];

export function TopbarFind() {
  const path = usePathname() ?? '';
  if (OWN_SEARCH.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return <HeaderSearch wide />;
}
