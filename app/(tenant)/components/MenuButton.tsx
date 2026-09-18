'use client';

import { useMobileNav } from './MobileNavProvider';
import { IconMenu } from './icons';

/**
 * Jira GRW-306 — the hamburger, inside the header row it belongs to.
 *
 * It used to be one fixed-position button drawn over every screen, so each
 * header had to leave 58px clear for it and two did not (Reports' title lost its
 * first letter; the walk-in sheet's title sat under it). In the row, nothing can
 * be covered and nothing has to remember to make room.
 *
 * Phone only (`.menu-btn` is `display: none` from 861px, where the sidebar is
 * always on screen). The drawer it opens is `Sidebar`, `id="site-menu"`.
 */
export function MenuButton() {
  const { open, toggle } = useMobileNav();
  return (
    <button type="button" className="menu-btn" aria-label="Menu" aria-expanded={open} aria-controls="site-menu" onClick={toggle}>
      <IconMenu />
    </button>
  );
}
