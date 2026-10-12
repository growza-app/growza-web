import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The floating plus goes away while the page scrolls down (owner, 2026-10-13).
 *
 * It sits over the bottom right of whatever is on screen — on Bookings, over a card's price — so it steps aside
 * while the thumb travels down a list and comes back on the way up. Two halves that are useless apart: the
 * component decides when, the stylesheet says what that looks like, and the rules below are the ones that make
 * it safe rather than merely pretty.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const nav = readFileSync(path.join(here, 'BottomNav.tsx'), 'utf-8');
const css = readFileSync(path.join(here, '../styles/83-role-home.css'), 'utf-8');

describe('the plus steps aside', () => {
  it('listens where the scrolling actually happens — any .page-body, not the window', () => {
    // A scroll event does not bubble, and the window is not what scrolls in this shell.
    expect(nav).toContain("document.addEventListener('scroll', onScroll, true)");
    expect(nav).toContain("document.removeEventListener('scroll', onScroll, true)");
  });

  it('hides on the way down and returns on the way up', () => {
    expect(nav).toMatch(/setAway\(moved > 0 && y > NEAR_TOP\)/);
  });

  it('stays put at the top of a list, and ignores a nudge', () => {
    expect(nav).toMatch(/NEAR_TOP = \d+/);
    expect(nav).toMatch(/if \(Math\.abs\(moved\) < TRAVEL\) return;/);
  });

  it('never vanishes under an open menu or out from under the keyboard', () => {
    expect(nav).toMatch(/if \(menuOpen \|\| document\.activeElement === centreRef\.current\) return;/);
  });

  it('comes back for the next screen', () => {
    expect(nav).toMatch(/useEffect\(\(\) => setAway\(false\), \[pathname\]\)/);
  });

  it('leaves the tab order while it is away', () => {
    expect(nav).toContain('tabIndex={away ? -1 : undefined}');
    expect(nav).toContain('aria-hidden={away || undefined}');
  });

  it('and stops taking taps, not only sight', () => {
    const rule = css.slice(css.indexOf('.bn-centre.is-away {'), css.indexOf('}', css.indexOf('.bn-centre.is-away {')));
    expect(rule).toContain('pointer-events: none');
    expect(rule).toContain('opacity: 0');
    expect(rule).toMatch(/transform: translateY\(/);
  });

  it('animates the move it was already animating', () => {
    // Reduced motion is handled once, globally (90-accessibility.css), so it snaps there rather than sliding.
    expect(css).toMatch(/transition:\s*\n\s*transform 0\.18s ease,\s*\n\s*opacity 0\.18s ease;/);
  });
});
