import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaAllows, areasOf } from './areas';
import { canSee } from './nav-policy';

/**
 * Jira GRW-610 — every screen survives a business that has never had a booking: what the audit found, and fixed as
 * guards, never as a second copy of a screen.
 *
 * The audit itself (every route walked, at 344px, empty and then with one order) is recorded in the PR; these are what
 * keeps its findings from coming back. Each is a PART of a shared screen that was salon-shaped, now absent for a
 * business without the thing it is about — and none of them touches what a salon sees.
 */
const tenant = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(tenant, p), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(tenant, '../../messages', `${lang}.json`), 'utf8')) as { reports: Record<string, string> };
const SHOP = areasOf({ capabilities: { bookings: false, services: false }, surface: 'shop' });
const SALON = areasOf({});

describe('FR-04 — a part that is meaningless for a business is absent, not zeroed', () => {
  it('the register shows a shop no service parts: the tab, the KPI, the filter, the legend and the column', () => {
    const client = read('sales/SalesClient.tsx');
    expect(client).toContain('const servicesOn = useAreas().services;');
    expect(client).toContain("SALES_FILTERS.filter((f) => servicesOn || f !== 'services')");
    expect(client).toContain("const showServicesCol = servicesOn && filter !== 'products';");
    expect(client).toMatch(/\{servicesOn \? \(\s*<button\s+type="button"\s+className=\{`sls-kpi sls-kpi-tap sls-kpi-blue/);
    expect(client).toMatch(/servicesOn && filter !== 'products' \? \(\s*<span className="sls-legend-item">/);
  });

  it('Clients — the list shows a business with no bookings no "last booking" and no "visits", in the table or on a card', () => {
    const list = read('customers/CustomersClient.tsx');
    expect(list).toContain('const bookingsOn = useAreas().bookings;');
    expect(list).toContain("{bookingsOn ? <th>{t('colLastBooking')}</th> : null}");
    expect(list).toMatch(/\{bookingsOn \? <SortableTh col="visits"/);
    expect(list).toContain('{bookingsOn ? <td>{c.totalBookings}</td> : null}');
    expect(list).toContain("{bookingsOn ? <span>{t('visitCount', { count: c.totalBookings })}</span> : null}");
  });

  it('Reports — every tab is built from bookings, so a business with none is told its own are on the way, with two doors', () => {
    const page = read('reports/page.tsx');
    const at = page.indexOf('if (!areasOf(me).bookings) {');
    expect(at).toBeGreaterThan(page.indexOf('me = await api.me()'));
    // …before the filters, the branch picker and every per-tab read.
    expect(at).toBeLessThan(page.indexOf('api.reportFilterOptions'));
    expect(page).toContain("href=\"/orders\"");
    expect(page).toContain("href=\"/stock\"");
    for (const lang of ['en', 'hi'] as const) {
      const r = messages(lang).reports;
      for (const key of ['shopSoonTitle', 'shopSoonBody', 'shopSoonOrders', 'shopSoonStock']) expect(r[key], `${lang} ${key}`).toBeTruthy();
    }
    expect(messages('hi').reports.shopSoonTitle).toMatch(/[ऀ-ॿ]/);
  });

  it('Settings — the diary’s row is listed only for a business that takes bookings, and their addresses are closed to one that does not', () => {
    const nav = read('settings/nav-data.tsx');
    expect(nav).toMatch(/key: 'bookingSettings', diaryOnly: true/);
    // Jira GRW-76 — Location check-in is a shop's too (its staff check themselves in); only Booking settings is the diary's alone.
    expect(nav).toMatch(/key: 'checkIn', icon/);
    expect(read('settings/SettingsNavList.tsx')).toContain('(!row.diaryOnly || areas.bookings)');
    expect(read('settings/booking/page.tsx')).toContain("await guardScreen('/settings/booking');");
    expect(read('settings/check-in/page.tsx')).toContain("await guardScreen('/settings/check-in');");
    expect(areaAllows('/settings/booking', SHOP)).toBe(false);
    expect(areaAllows('/settings/check-in', SHOP)).toBe(true);
    // The rest of Settings is a shop’s too: its profile, hours, GST, branches, payments and bill.
    for (const ok of ['/settings', '/settings/profile', '/settings/working-hours', '/settings/gst', '/settings/business', '/settings/branches', '/settings/payments', '/settings/billing']) expect(areaAllows(ok, SHOP), ok).toBe(true);
  });
});

describe('BR-04 — a salon’s rendering of every audited screen is unchanged', () => {
  it('every address is answered as before for a business with the diary', () => {
    for (const href of ['/sales', '/settings/booking', '/settings/check-in', '/reports', '/appointments', '/services']) {
      expect(areaAllows(href, SALON), href).toBe(true);
      expect(canSee(href, 'owner', ['overview'], true, SALON), href).toBe(canSee(href, 'owner', ['overview'], true));
    }
  });

  /*
   * Jira GRW-611 review — every surface that filters by `canSee` passes the business's `areas`.
   *
   * NotLiveHome did not, so a shop being set up was offered Staff and Services (both closed to it, both bouncing back
   * here) and not the shelf, while the tab bar below it offered exactly the opposite. A tile that cannot open is the
   * failure this whole module exists to stop, so the pin is on the argument, not on the tiles.
   */
  it('every Home that filters destinations asks with the business’s areas, so no tile can open on a bounce', () => {
    const notLive = read('components/home/NotLiveHome.tsx');
    expect(notLive).toContain('const areas = useAreas();');
    expect(notLive).toContain('canSee(l.href, role, reportTabs, false, areas)');
    // And a shop being set up is offered its own setup screen there, as the tab bar is.
    expect(notLive).toMatch(/href: '\/stock'/);
    expect(canSee('/stock', 'owner', undefined, false, SHOP)).toBe(true);
    expect(canSee('/providers', 'owner', undefined, false, SHOP)).toBe(false);
    expect(canSee('/services', 'owner', undefined, false, SHOP)).toBe(false);
    // A salon's three are untouched: the shelf is not offered to it at all.
    expect(canSee('/stock', 'owner', undefined, false, SALON)).toBe(false);
    for (const href of ['/providers', '/services', '/settings']) expect(canSee(href, 'owner', undefined, false, SALON), href).toBe(true);
  });

  it('a shop’s Home offers no door onto a screen that answers it with "not yet"', () => {
    const home = read('components/home/ShopHome.tsx');
    expect(home, 'the Reports tile lands on the GRW-610 placeholder').not.toMatch(/href: '\/reports'/);
    // And "View all" opens the shelf, not a filter that answers per style what this list says per size.
    expect(home).toContain('href={`/stock${stockBranch}`}');
    expect(home).not.toContain('filter=low');
  });

  it('the shared screens take their shop heading ONLY under the shop’s own address', () => {
    expect(read('products/ProductsScreen.tsx')).toContain("heading={guard === '/stock' ? homeCopy(await serverLang(), me.labels).nav.stock : undefined}");
    expect(read('products/ProductsList.tsx')).toContain("title={heading ?? t('title')}");
  });
});
