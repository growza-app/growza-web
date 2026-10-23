import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeCopy } from '../../lib/home-copy';
import { canSee, canSeeRevenue } from '../../lib/nav-policy';
import { areasOf } from '../../lib/areas';

/**
 * Jira GRW-609 — a shop's Home, pinned in its source (the screen is a client component) and in its words.
 */
const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const shop = here('./ShopHome.tsx');
const page = here('../../page.tsx');
const css = here('../../styles/99-shop-home.css');

describe('FR-05, FR-06 — chosen with the other Homes, before any of the diary’s reads; the salon’s Homes are untouched', () => {
  it('page.tsx hands a shop to ShopHome after the live check and BEFORE the stylist, front-desk and owner reads', () => {
    const at = page.indexOf('areasOf(me).shop');
    expect(at).toBeGreaterThan(page.indexOf('<NotLiveHome'));
    expect(at).toBeLessThan(page.indexOf("if (kind === 'stylist')"));
    expect(at).toBeLessThan(page.indexOf("api.home('today')"));
    expect(page).toMatch(/if \(areasOf\(me\)\.shop && \(kind !== 'stylist' \|\| areasOf\(me\)\.pages\)\) \{\n[^\n]*\n\s*const \[initial, attendanceMonth\] = await Promise\.all\(\[\n\s*soft\(api\.shopHome\(\)\),/);
  });

  it('the one read it makes is the shop’s own; none of the diary’s is imported', () => {
    expect(shop).toContain('api\n      .shopHome(location)');
    for (const diary of ['api.appointments', 'api.tokensToday', 'api.walkInQueue', 'api.home(', 'OwnerHome', 'ReceptionHome', 'BookedToday']) expect(shop, diary).not.toContain(diary);
  });
});

describe('AC-02 — the counter sees no money', () => {
  it('draws the takings only for a role that may see revenue AND a response that carries them', () => {
    expect(shop).toContain("const money = areas.pages ? (areas.pages.reports ?? 'none') !== 'none' : canSeeRevenue(role);");
    expect(shop).toMatch(/money && data\.today\.takingsMinor !== undefined/);
    expect(canSeeRevenue('owner')).toBe(true);
    expect(canSeeRevenue('manager')).toBe(true);
    expect(canSeeRevenue('receptionist')).toBe(false);
  });

  it('the front desk’s doors are Orders, Stock is the owner’s: the tiles come from the same canSee the nav asks', () => {
    expect(shop).toContain('canSee(l.href, role, reportTabs, true, areas)');
    const shopAreas = areasOf({ capabilities: { bookings: false, services: false }, surface: 'shop' });
    expect(canSee('/stock', 'receptionist', undefined, true, shopAreas)).toBe(false);
    expect(canSee('/products/sell', 'receptionist', undefined, true, shopAreas)).toBe(true);
  });
});

describe('AC-03 — a brand-new shop: each section says its own plain thing, and one action offers the first order', () => {
  it('has an empty line for orders, for stock never counted, and for nothing running low', () => {
    expect(shop).toContain('s.noOrdersTitle');
    expect(shop).toContain('s.noOrdersBody');
    expect(shop).toMatch(/href="\/orders\/new">\s*\{s\.takeOrder\}/);
    // …but only once there is something to sell: a shelf nobody has counted is sent to the count first.
    // `|| !areas.stock` — a kitchen has no shelf to count first, so its first step is the till itself.
    expect(shop).toContain('data.running.counted || !areas.stock ? s.noOrdersBody : s.countFirst');
    expect(shop).toMatch(/\(data\.running\.counted \|\| !areas\.stock\) && can\('\/orders\/new'\) \? \(\s*<a className="btn btn-primary shp-cta" href="\/orders\/new">/);
    expect(shop).toContain('!data.running.counted');
    expect(shop).toContain('s.notCounted');
    expect(shop).toContain('s.nothingLow');
  });

  it('a stock never counted offers the count, not a list of zeros', () => {
    expect(shop).toMatch(/!data\.running\.counted \? \(\s*<div className="shp-empty">[\s\S]*?s\.countStock/);
  });
});

describe('error handling — a failed read is one plain line with a retry, and the doors stay', () => {
  it('shows the error card and keeps the quick tiles (and so the nav) usable', () => {
    expect(shop).toMatch(/failed \|\| !data \? \(\s*<Card>\s*<CardError t=\{t\} onRetry=\{\(\) => load\(branch\)\} \/>/);
    // Still OUTSIDE that branch — that is the point of this test — but now with the salon's chrome
    // around it (`hm-area-links hm-mobile`), which is what keeps its labels off the tab bar.
    expect(shop).toMatch(/tiles\.length > 0 \? \(\s*<Card className="hm-area-links hm-mobile shp-links" title=\{t\.quickLinks\}>\s*<QuickTiles items=\{tiles\} \/>/);
    const errorBranch = shop.indexOf('failed || !data ? (');
    expect(shop.indexOf('<QuickTiles items={tiles} />')).toBeGreaterThan(errorBranch);
  });

  it('follows the branch the owner picked, and returns to every branch when they let go', () => {
    expect(shop).toContain('useBranch()');
    expect(shop).toMatch(/if \(branch === loadedFor\.current\) return;\n\s*load\(branch\);/);
  });
});

describe('UX-07 — English and Hindi for every line, the nouns from the vertical', () => {
  const en = homeCopy('en', { order: 'Order', orders: 'Orders' }).shop;
  const hi = homeCopy('hi', { order: 'Order', orders: 'Orders' }).shop;

  it('every key has both, and Hindi is not English in disguise', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(hi)) {
      if (typeof value === 'string') expect(value, key).toMatch(/[ऀ-ॿ]/);
    }
    expect(hi.left(2)).toMatch(/[ऀ-ॿ]/);
    expect(hi.sizeWord('30')).toBe('साइज़ 30');
  });

  it('counts an order in the vertical’s own word, singular and plural; Hindi uses its generic one', () => {
    expect(en.orderCount(1)).toBe('1 order');
    expect(en.orderCount(11)).toBe('11 orders');
    expect(hi.orderCount(11)).toBe('11 ऑर्डर');
    // A vertical that calls them something else is read in its word, with no code change.
    expect(homeCopy('en', { order: 'Sale', orders: 'Sales' }).shop.orderCount(3)).toBe('3 sales');
  });

  it('the running-out line reads "size 30 · 2 left", and "None left" at zero', () => {
    expect(en.sizeWord('30 / White')).toBe('size 30 / White');
    expect(en.left(2)).toBe('2 left');
    expect(en.left(0)).toBe('None left');
    expect(en.viewAll(27)).toBe('View all (27)');
  });
});

describe('UX-01, UX-02, UX-05 — laid out at 344px on the tokens, with 44px doors, and nothing moves', () => {
  it('sets type in rem, spaces with the scale, and has no animation', () => {
    expect(css).not.toMatch(/font-size:\s*\d+(\.\d+)?px/);
    expect(css).not.toMatch(/@keyframes|animation:|transition:/);
    expect(css).toMatch(/var\(--sp-\d\)/);
  });

  it('every link and row is at least 2.75rem tall', () => {
    expect(css).toMatch(/\.shp-link \{[^}]*min-height: 2\.75rem/);
    expect(css).toMatch(/\.shp-cta \{[^}]*min-height: 2\.75rem/);
    expect(css).toMatch(/\.shp-running li \{[^}]*min-height: 2\.75rem/);
  });

  it('is one column on a phone and two from 861px', () => {
    // A comment may sit between the query and the selector (GRW-643 explains the missing
    // `align-items` there); what is pinned is that 861px is where the grid starts.
    expect(css).toMatch(/@media \(min-width: 861px\) \{[\s\S]*?\.shp-page \{\s*display: grid;/);
  });
});
