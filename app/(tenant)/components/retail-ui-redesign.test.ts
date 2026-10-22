import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeCopy } from '../lib/home-copy';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (rel: string) => readFileSync(path.resolve(root, rel), 'utf8');

describe('Retail Enterprise UI Redesign across all 6 surfaces', () => {
  it('Surface 1 (Home): renders the 4-card Executive KPI Strip, balanced 2-column desktop stack, and bookings-off header search label', () => {
    const shopHome = read('app/(tenant)/components/home/ShopHome.tsx');
    const shopHomeCss = read('app/(tenant)/styles/99-shop-home.css');
    const headerSearch = read('app/(tenant)/components/HeaderSearch.tsx');

    expect(shopHome).toContain('shp-kpi-strip');
    expect(shopHome).toContain('shp-col-stack');
    expect(shopHome).toContain('s.todaysTakings');
    expect(shopHome).toContain('s.yesterdaysTakings');
    expect(shopHome).toContain('s.waitingToSendLabel');
    expect(shopHome).toContain('s.lowStockLabel');
    expect(shopHomeCss).toContain('.shp-kpi-strip');
    expect(shopHomeCss).toContain('.shp-col-stack');
    expect(headerSearch).toContain('areas.bookings === false');

    for (const lang of ['en', 'hi'] as const) {
      const copy = homeCopy(lang);
      expect(copy.shop.todaysTakings).toBeTruthy();
      expect(copy.shop.yesterdaysTakings).toBeTruthy();
      expect(copy.shop.waitingToSendLabel).toBeTruthy();
      expect(copy.shop.lowStockLabel).toBeTruthy();
      expect(copy.shop.whatSellsLink).toBeTruthy();
      expect(copy.shop.whatToOrderLink).toBeTruthy();
      expect(copy.shop.channelsLink).toBeTruthy();
      expect(copy.shop.stockReportLink).toBeTruthy();
    }
  });

  it('Surface 2 (Orders): uses ghost secondary actions, structured filter bar, and channel badges', () => {
    const ordersScreen = read('app/(tenant)/orders/OrdersScreen.tsx');
    const ordersClient = read('app/(tenant)/orders/OrdersClient.tsx');
    const ordersCss = read('app/(tenant)/styles/99-orders.css');

    expect(ordersScreen).toContain('className="btn btn-ghost" href="/orders/import"');
    expect(ordersScreen).toContain('className="btn btn-primary" href="/orders/new"');
    expect(ordersClient).toContain('ord-chips-channel');
    expect(ordersClient).toContain('ord-chips-state');
    expect(ordersClient).toContain('ord-chan-badge');
    expect(ordersCss).toContain('.ord-chan-badge');
    expect(ordersCss).toContain('.ord-chips-channel');
  });

  it('Surface 3 (Reports): shares RetailReportsNav across all 6 retail report screens and renders RetailReportsHub on /reports', () => {
    const reportsPage = read('app/(tenant)/reports/page.tsx');
    const navFile = read('app/(tenant)/components/RetailReportsNav.tsx');
    const reportCss = read('app/(tenant)/styles/99-stock-report.css');

    expect(reportsPage).toContain('RetailReportsNav');
    expect(reportsPage).toContain('RetailReportsHub');
    expect(navFile).toContain('export function RetailReportsNav');
    expect(navFile).toContain('export function RetailReportsHub');
    expect(reportCss).toContain('.srp-nav');
    expect(reportCss).toContain('.srp-nav-tab');

    for (const pagePath of [
      'app/(tenant)/stock/channels/page.tsx',
      'app/(tenant)/stock/sellers/page.tsx',
      'app/(tenant)/stock/report/page.tsx',
      'app/(tenant)/stock/order/page.tsx',
      'app/(tenant)/orders/returns/page.tsx',
      'app/(tenant)/orders/refunds/page.tsx',
    ]) {
      expect(read(pagePath)).toContain('RetailReportsNav');
    }
  });

  it('Surface 4 (POS) & Surface 5 (Stock & Customers): styles POS bar and tiles, stock subtitle, and 4-column desktop customers table', () => {
    const posCss = read('app/(tenant)/styles/99-pos.css');
    const productsList = read('app/(tenant)/products/ProductsList.tsx');
    const deskClientsCss = read('app/(tenant)/styles/79-desk-clients.css');
    const controlsCss = read('app/(tenant)/styles/01-controls.css');

    expect(posCss).toContain('.pos-bar');
    expect(posCss).toContain('.pf-wide:has(.prd-cat-li) .pf-wide-tiles');
    expect(productsList).toContain("heading !== undefined ? t('stockSubtitle') : t('subtitle')");
    expect(deskClientsCss).toContain('.cust-desk-table:not(:has(th:nth-child(6)))');
    expect(controlsCss).toMatch(/\.btn\s*\{[\s\S]*?text-decoration:\s*none;/);
  });
});
