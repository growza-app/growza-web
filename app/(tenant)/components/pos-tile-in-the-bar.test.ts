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

  it('the POS: a raised 42px green circle with its word under it, a visible focus, no motion when asked for none', () => {
    expect(nav).toContain('<span className="bn-pos-btn" aria-hidden="true">');
    expect(css).toMatch(/\.bn-pos-btn \{[^}]*width: 2\.625rem;\s*height: 2\.625rem;\s*border-radius: 50%;/);
    expect(css).toMatch(/\.bottom-nav\.bn-shop a\.bn-pos-tile:focus-visible \.bn-pos-btn \{/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.bn-pos-btn \{\s*transition: none;/);
  });
});
