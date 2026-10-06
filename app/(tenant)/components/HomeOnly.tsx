'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Children are drawn on Home and nowhere else.
 *
 * The billing warning sat above every screen, so a suspended owner read the same red paragraph on Services, Staff and
 * Settings — a third of a phone screen, repeated, on pages that already have nothing to write. Home is where an owner
 * lands and where a warning about the account belongs; Billing has its own Pay card. The children stay server-rendered
 * (this only decides whether to show them), so the banner's words and Pay button are unchanged.
 */
export function HomeOnly({ children }: { children: ReactNode }) {
  return usePathname() === '/' ? <>{children}</> : null;
}
