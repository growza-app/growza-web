import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Final check 2026-11-14 — the front desk's laptop Home drew report figures it is refused under the report's words:
 * "Units sold 18 · Last 7 days" was today's orders, "Stock at cost price 26" the running-low count, "Returned 0"
 * while 8 came back today; and each box linked to a screen that sent the desk back to Home.
 */
const home = readFileSync(new URL('./ShopHome.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles/83-role-home.css', import.meta.url), 'utf8');

describe('the laptop top row says only what this person can see', () => {
  it('Units sold is drawn only for whoever reads the sellers report, and links there', () => {
    expect(home).toContain("const showSellers = reportsOn && can('/stock/sellers');");
    expect(home).toMatch(/\{!showSellers \? null : \(\s*<a\s+className="hm-v3-kpi hm-v3-kpi-link hm-v3-kpi-amber"\s+href="\/stock\/sellers"/);
  });

  it('without the stock report the Stock box is what is running low, and says so', () => {
    expect(home).toContain('{showStockWorth ? s.stockWorthTitle : s.runningLowChip}');
    expect(home).toContain("showStockWorth ? '/stock/report' : can('/stock') ? `/stock${stockBranch}` : null,");
  });

  it("Returned is today's returns for whoever has no report, and Orders links only where it can open", () => {
    expect(home).toContain('{reportsOn ? totalReturnedOrders : (data.cameBackToday ?? 0)}');
    expect(home).toContain("can('/orders') ? (data.toSend > 0 ? ordersHref({ status: 'new,packed' }) : '/orders') : null,");
  });

  it('a box with nowhere to go is not a link', () => {
    expect(home).toContain('<section className={`hm-v3-kpi ${tone}`}>{body}</section>');
    expect(css).toMatch(/\.hm-v3-kpis-2 \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  it('cards whose figure this person is refused are not drawn, so none says there were no sales', () => {
    // Sales trend (money), Top sellers (sellers report), Recent orders (the Orders list), the money-only toolbar.
    expect(home).toMatch(/\{!money \? null : \(\s*<section className="hm-v3-card hm-v3-trend-card">/);
    expect(home).toMatch(/\{!showSellers \? null : \(\s*<section className="hm-v3-card hm-v3-staff-card">/);
    expect(home).toContain("const showRecent = can('/orders');");
    expect(home).toMatch(/\{!showRecent \? null : \(\s*<section className="hm-v3-card hm-v3-recent-card">/);
    expect(home).toContain("const showToolbar = money || (isKitchen && can('/stock'));");
    expect(home).toMatch(/\{showToolbar \? \(\s*<div className="hm-toolbar shp-desk-toolbar">/);
    expect(home).toContain('{midCount === 0 ? null : (');
  });
});
