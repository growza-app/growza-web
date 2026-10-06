'use client';

import { useEffect, useState } from 'react';

/**
 * The phone layout. False on the server and until mounted.
 *
 * `max-width: 860px` — the app's own mobile breakpoint, the one `.hm-desktop`/`.hm-mobile` switch on and the
 * bottom bar is drawn at (83-role-home.css, 74-mobile-chrome-2026.css). It has to be the SAME number, not one
 * off it: at 859 a 860px-wide screen was mobile by every stylesheet and desktop to this hook, so the same
 * action opened a page from the tab bar and a pop-up from Home. The device matrix checks 859/861 for exactly
 * this kind of gap (CLAUDE.md).
 */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(max-width: 860px)');
    const on = () => setPhone(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return phone;
}
