import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner's review 2026-11-13 — on a phone the retail report pages (Top sellers, Stock report, Reorder list, Sales
 * by channel, Returns, Refunds) opened with a 198px two-column grid of seven tabs; the Reports hub had already
 * made its own copy of the bar a 44px scroller. Now the bar is that scroller on every report page, and the
 * current tab is scrolled to the middle on arrival.
 */
const css = readFileSync(new URL('../styles/99-stock-report.css', import.meta.url), 'utf8');
const nav = readFileSync(new URL('./RetailReportsNav.tsx', import.meta.url), 'utf8');

describe('the report tab bar on a phone', () => {
  it('is one scrolling row of chips at ≤860px, not a two-column grid', () => {
    expect(css).not.toMatch(/\.srp-nav \{\s*display: grid;/);
    expect(css).not.toContain('@media (max-width: 600px)');
    const phone = css.slice(css.indexOf('@media (max-width: 860px)'));
    expect(phone).toMatch(/\.srp-nav \{[^}]*display: flex;[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/);
    expect(phone).toMatch(/\.srp-nav \{[^}]*scrollbar-width: none;/);
    expect(phone).toMatch(/\.srp-nav-tab \{[^}]*flex: none;[^}]*min-height: 2\.75rem;/);
  });

  it('brings the current tab into the middle on arrival', () => {
    expect(nav).toContain('<nav ref={navRef}');
    expect(nav).toContain("nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;");
    expect(nav).toMatch(/useEffect\(\(\) => \{[\s\S]*\}, \[active\]\);/);
  });
});
