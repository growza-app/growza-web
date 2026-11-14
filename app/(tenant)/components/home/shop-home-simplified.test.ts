import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeCopy } from '../../lib/home-copy';

/**
 * 13 Nov 2026 — the shop's laptop Home printed today's money three times, the date range three times and the
 * Counter · Flipkart · Amazon split twice (Flipkart and Amazon at ₹0), and its Quick actions were the sidebar
 * again. One range control, one Day summary, the channel split only once a second channel sells, and one
 * Needs attention card in place of Quick actions and the two attention cards.
 */
const shop = readFileSync(resolve(__dirname, 'ShopHome.tsx'), 'utf8');

describe('a shop’s Home says each thing once', () => {
  it('has no live-today pill, no range control on a card, and no sparkline on the KPI cards', () => {
    expect(shop).toContain('{isKitchen && money && data.today.takingsMinor !== undefined ? (\n                  <span className="shp-live-pill">');
    expect(shop).not.toContain('hm-v3-kpi-period');
    expect(shop).not.toContain('hm-v3-period-pill is-static');
    expect(shop).not.toContain('hm-v3-mini-bars');
  });

  it('opens Day summary from the toolbar only, and drops Import orders from it', () => {
    expect(shop).toContain('onDaySummary={money && isKitchen ? () => setSummaryOpen(true) : undefined}');
    expect(shop).not.toContain('href="/orders/import"');
  });

  it('splits by channel only once something sold outside the counter', () => {
    expect(shop).toContain("const soldElsewhere = channelBreakdown.some((ch) => ch.key !== 'counter' && ch.billed > 0);");
    expect(shop).toMatch(/\{soldElsewhere \? \(\s*<div className="hm-v3-kpi-foot hm-v3-split-foot">/);
    expect(shop).toContain('{money && canReports && soldElsewhere ? (\n                  <section className="hm-v3-card shp-channels-card">');
  });

  it('has one Needs attention card that draws only counts above zero', () => {
    expect(shop).not.toContain('hm-v3-quick-card');
    expect(shop).not.toContain('shp-orders-att');
    expect(shop.match(/shp-needs-card/g)).toHaveLength(1);
    expect(shop).toContain('].filter((c) => c.n > 0 && c.href !== null);'); // F10 (QA 2026-11-14): and only a row that opens
    expect(shop).toContain('{attentionCount === 0 ? (');
  });

  it('the units card leaves the money to the Sales card, in both languages', () => {
    expect(homeCopy('en').shop.acrossSizesOnly(126)).toBe('across 126 sizes');
    expect(homeCopy('en').shop.acrossSizesOnly(1)).toBe('across 1 size');
    expect(homeCopy('hi').shop.acrossSizesOnly(126)).toBe('126 साइज़ में');
  });
});

describe('out of stock is counted over the whole list, not a page of it', () => {
  it('reads the API’s count, and asks the stock report only for its totals', () => {
    expect(shop).toContain('const outOfStockCount = data?.running.out ?? (data?.running.items ?? []).filter((i) => i.left <= 0).length;');
    expect(shop).toContain('.stockReport({ location: loc, pageSize: 1 })');
    expect(shop).not.toContain('stockData.styles');
  });
});
