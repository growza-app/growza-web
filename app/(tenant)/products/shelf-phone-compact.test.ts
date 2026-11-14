import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { branchInAddress, oneBranchOnly } from '../lib/branch-routes';

/**
 * Owner's review 2026-11-13 — the shop's Stock screen on a phone put its first product at 591px of 844: a
 * banner contradicting the header, four tiles that repeated the chips, a selects row and a chips row, and a
 * WhatsApp share on every row. Four changes, all on the counted shelf only (a kitchen's Menu is byte-equivalent):
 *   1. `/stock` is a one-branch screen like `/products`, so the header names the branch and the banner goes.
 *   2. The four tiles become one line (count · worth); Low / Out live in the chips.
 *   3. One scroller holds the chips, Categories, the sort and Bulk edit; the Categories menu is pinned to the
 *      viewport so the scroller cannot clip it.
 *   4. The share moves into the product sheet.
 */
const list = readFileSync(new URL('./ProductsList.tsx', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('./ProductSheet.tsx', import.meta.url), 'utf8');
const dropdown = readFileSync(new URL('./DeskProductCategories.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/96-products.css', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8'));
const hi = JSON.parse(readFileSync(new URL('../../../messages/hi.json', import.meta.url), 'utf8'));

describe('the shelf on a phone, compacted', () => {
  it('names the branch in the header on /stock, and the banner is the kitchen’s only', () => {
    expect(oneBranchOnly('/stock')).toBe(true);
    expect(branchInAddress('/stock')).toBe(true);
    // The reports under it follow the shared choice and still offer "All".
    for (const p of ['/stock/report', '/stock/order', '/stock/sellers', '/stock/channels']) {
      expect(oneBranchOnly(p)).toBe(false);
      expect(branchInAddress(p)).toBe(false);
    }
    expect(list).toContain('{shownBranchName && !counted ? <div className="banner banner-info prd-branch-note">');
  });

  it('draws one line where the four tiles were, on the phone layout of a counted shelf', () => {
    expect(list).toContain("const shelfLine = <p className=\"prd-shelf-line\">{t('shelfLine', { count: inCategory.length, worth: formatMoney(worth) })}</p>;");
    expect(list).toContain('{counted ? shelfLine : strip}');
    // The desk keeps its four tiles.
    expect(list).toContain('className="prd-strip prd-strip-4"');
    expect(en.products.shelfLine).toContain('{count, plural,');
    expect(hi.products.shelfLine).toContain('{worth}');
  });

  it('puts the chips, Categories, the sort and Bulk edit in one scroller', () => {
    expect(list).toContain('<div className="prd-chips prd-filter-row" role="group" aria-label={t(\'filters.label\')}>');
    const row = list.indexOf('prd-filter-row');
    const block = list.slice(row, row + 1400);
    expect(block.indexOf('SHELF_FILTERS.map')).toBeLessThan(block.indexOf('{categoriesDropdown}'));
    expect(block.indexOf('{categoriesDropdown}')).toBeLessThan(block.indexOf('{sortBox}'));
    expect(block).toContain('className="prd-chip prd-chip-edit"');
    // The old chips row is not drawn beside it on the phone (the desk keeps its own chips under its tools).
    const phone = list.slice(list.indexOf('<div className="page-body prd-page">'));
    expect(phone).not.toContain('{counted ? chips : null}');
    expect(list).toContain('fixedMenu={desk === false && counted}');
    expect(dropdown).toContain('fixedMenu?: boolean;');
    expect(dropdown).toContain('setMenuTop(wrapRef.current.getBoundingClientRect().bottom + 6)');
    expect(dropdown).toContain('maxHeight: `calc(100dvh - ${menuTop}px - 16px)`');
    expect(css).toMatch(/\.prd-filter-row \.sls-dd-menu\.is-fixed \{[^}]*position: fixed;/);
    expect(css).toMatch(/\.prd-filter-row \.sls-dd-menu\.is-fixed \{[^}]*overflow-y: auto;/);
  });

  it('shares from the product sheet, not from every row', () => {
    const row = list.slice(list.indexOf('<ul className="prd-list">'), list.indexOf('const showSku'));
    expect(row).not.toContain('ShareOnWhatsAppButton');
    expect(row).not.toContain('prd-row-share');
    expect(sheet).toContain('const shareItem = product && counted ? productShareItem(product, { counted }) : null;');
    expect(sheet).toContain('className="prd-sheet-share"');
    // The kitchen's menu cards keep theirs.
    expect(list).toContain('{shareItem ? <ShareOnWhatsAppButton item={shareItem} branchId={p.locationId} bookable={false} photoUrl={p.imageUrl} /> : null}');
  });
});
