import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../lib/dashboard-root';

/**
 * Owner, 2026-11-23 — a shop's (and a kitchen's) phone bar, from the owner's own reference: Home · Orders · POS · Menu ·
 * Alerts (More gave way to Alerts the same day). The POS is a raised circle on every screen with the bar; Guests is in
 * the side menu. A salon keeps its bar and its corner "New booking". A role that may not open the
 * POS gets no tile.
 */
const read = (rel: string) => readFileSync(fromDashboard(rel), 'utf8');
const nav = read('app/(tenant)/components/BottomNav.tsx');
const chrome = read('app/(tenant)/components/MobileChrome.tsx');
const css = read('app/(tenant)/styles/74-mobile-chrome-2026.css');

describe('a shop’s bar: Home · Orders · POS · Menu · Alerts', () => {
  it('the tab you are on keeps its word and gets a small green dot under it', () => {
    expect(nav).toContain('<span className="bn-mark" />');
    expect(css).toMatch(/\.bottom-nav\.bn-shop a\.active \.bn-mark \{\s*display: block;[^}]*width: 5px;\s*height: 5px;[^}]*border-radius: 50%;\s*background: var\(--accent\);/);
  });

  it('is drawn for a live shop that is not a stylist; everyone else keeps the bar they had', () => {
    expect(nav).toContain('if (areas.shop && live && !stylist) {');
  });

  it('Home, Orders, the POS, Menu, then Alerts — in that order', () => {
    const shop = nav.slice(nav.indexOf('if (areas.shop && live && !stylist) {'));
    expect(shop.indexOf("href: '/'")).toBeLessThan(shop.indexOf("href: '/orders'"));
    expect(shop.indexOf("href: '/orders'")).toBeLessThan(shop.indexOf("href: '/pos?mode=queue'"));
    expect(shop.indexOf("href: '/pos?mode=queue'")).toBeLessThan(shop.indexOf("href: '/notifications'"));
    expect(shop.indexOf('{left.map(tab)}')).toBeLessThan(shop.indexOf('className="bn-pos-tile"'));
    expect(shop.indexOf('className="bn-pos-tile"')).toBeLessThan(shop.indexOf('{right.map(tab)}'));
    expect(shop).not.toContain('bn-more');
  });

  it('owner, 2026-11-24 — a kitchen\'s fourth tab is the Queue (Pickup with Table orders on); a shop that counts stock keeps Menu', () => {
    const shop = nav.slice(nav.indexOf('if (areas.shop && live && !stylist) {'));
    expect(shop).toContain("areas.stock\n          ? { href: '/stock', label: t.nav.stock, icon: <IconProducts /> }\n          : { href: '/pos?mode=queue', label: tablesOn ? t.shop.pickupTitle : t.shop.queueTitle, icon: <IconNavOrders /> },");
    expect(nav).toContain('const tablesOn = (session?.branches ?? []).some((b) => b.tableOrders && (queueBranch === null || b.id === queueBranch));');
  });

  it('the tile is there only for a role the POS screen would let in, on every screen with the bar', () => {
    expect(chrome).toContain("const onPos = areas.shop && live && writable && canSee('/pos', role, undefined, true, areas)");
    expect(nav).toContain('{onPos ? (');
    expect(chrome).not.toMatch(/onPos[^;]*PLUS_ROUTE_RE/);
  });

  // Owner, 2026-11-26 — "put the POS inside the nav bar only … keep the circle, no need to mention POS".
  it('the POS: a 48px green glass circle inside the bar, its word for a screen reader only, a visible focus, no motion when asked for none', () => {
    expect(nav).toContain('<span className="bn-pos-btn" aria-hidden="true">');
    // Owner, 2026-11-26 — "use the bill icon", then "F is looking good": the cash register in the circle.
    expect(nav).toMatch(/<span className="bn-pos-btn" aria-hidden="true">\s*<IconPos \/>/);
    expect(css).toMatch(/\.bn-pos-btn \{[^}]*width: 3rem;\s*height: 3rem;\s*border-radius: 50%;/);
    // Nothing rises above the bar: no absolute circle, no notch cut in the bar, no fade on the page under it.
    expect(css).not.toMatch(/\.bn-pos-btn \{[^}]*position: absolute;/);
    expect(css).not.toContain('mask-composite');
    expect(css).not.toContain('.content:has(> .bottom-nav.has-pos-tile) .page-body');
    // The word is hidden from sight, not removed: the link is still called "POS".
    expect(nav).toContain('<span className="bn-label">{t.nav.pos}</span>');
    expect(css).toMatch(/a\.bn-pos-tile \.bn-label \{[^}]*clip: rect\(0 0 0 0\);/);
    expect(css).toMatch(/\.bottom-nav\.bn-shop a\.bn-pos-tile:focus-visible \.bn-pos-btn \{/);
    // The glass has a plain answer for reduce transparency and increase contrast.
    expect(css).toMatch(/prefers-reduced-transparency: reduce\)[^{]*prefers-contrast: more\) \{\s*\.bn-pos-btn \{\s*background: var\(--accent-deep\);/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.bn-pos-btn \{\s*transition: none;/);
  });
});
