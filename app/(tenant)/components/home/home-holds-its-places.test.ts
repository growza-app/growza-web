import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-23 — "when coming back to home from any other page, the page shows some glitch on mobile and the
 * desktop. The desktop queue option just goes from left to right." A menu tap reloads the page, so whatever arrives
 * after the first paint moves what is under or beside it. Measured in a browser before this change: 0.23 of layout
 * shift on a 1366 laptop (the Queue card 292 → 1053px across, the rows under it 55px down, the menu 64px down, New
 * order 52px left) and 0.062 on a phone (everything under the takings 64px down). After: 0.003 and 0.
 */
const home = readFileSync(new URL('./ShopHome.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../Sidebar.tsx', import.meta.url), 'utf8');
const bell = readFileSync(new URL('../PageHeadBell.tsx', import.meta.url), 'utf8');
const emerald = readFileSync(new URL('../../styles/99-z-emerald-v2.css', import.meta.url), 'utf8');
const shop = readFileSync(new URL('../../styles/99-shop-home.css', import.meta.url), 'utf8');

describe('Home holds its places while it loads', () => {
  it('laptop: two empty chart cards stand where the week and the payments will be, until their figures come or fail', () => {
    expect(home).toContain("const chartsPending = money && canReports && can('/stock/channels') && channelData === null && !channelSettled;");
    expect(home).toMatch(/\.finally\(\(\) => \{\s*if \(mine === deskReqId\.current\) setChannelSettled\(true\);/);
    expect(home).toContain('<section className="rst-panel rst-week-panel is-placeholder" aria-hidden="true" />');
    expect(home).toContain('<section className="rst-panel rst-pay-panel is-placeholder" aria-hidden="true" />');
    // Same classes as the real cards, so the tablet layout (week across the row) places them the same way.
    expect(emerald).toMatch(/\.rst-charts \{\s*grid-auto-rows: minmax\(13\.9375rem, auto\);/);
  });

  it('laptop: the business card at the top of the menu and the bell beside New order keep a box until the width is known', () => {
    expect(sidebar).toContain(') : wide === null && drawn ? (');
    expect(sidebar).toContain('<div className="sb-biz is-placeholder" aria-hidden="true" />');
    expect(bell).toContain('if (live && !inSidebar && wide === null) return <span className="page-head-bell is-placeholder" aria-hidden="true" />;');
    // Never on a phone: hidden there as the card is, and drawn the bell's size on a laptop.
    expect(emerald).toMatch(/\.sb-biz,\s*\.sb-acct,\s*\.page-head-bell\.is-placeholder \{\s*display: none;/);
    expect(emerald).toMatch(/\.page-head-bell\.is-placeholder \{\s*display: block;/);
  });

  it('phone: the loading block under the takings is as tall as the figure, the orders line and the payments line', () => {
    expect(shop).toMatch(/\.shp-hero-skeleton \{\s*height: 7\.5rem;/);
  });
});
