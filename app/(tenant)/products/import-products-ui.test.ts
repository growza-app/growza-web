import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { Product, ProductImportResult } from '../lib/api-types';
import { ImportProductDone } from './ImportProductDone';
import { ImportProductReview } from './ImportProductReview';
import { buildDrafts, suggest, type ProductDraft } from './product-import';

/**
 * Owner, 2026-10-18 — what the owner sees reviewing a file and after importing it: the rows that are NOT going in
 * and why, the categories that would appear, the stock that is not used, and how their columns were read.
 */
const shelfProduct = (over: Partial<Product>): Product => ({
  id: 'p1', name: 'Argan Oil', priceMinor: '45000', currency: 'INR', stock: 5, imageUrl: null, active: true, locationId: 'loc', sold: 0, costMinor: null,
  lowStockAt: 0, categoryId: null, categoryName: null, sku: null, barcode: '111', gstRateBp: null, hsn: null, ...over,
});

const headers = ['Product name', 'Barcode', 'MRP', 'Qty', 'Category', 'Notes'];
const rows = [
  ['Argan Oil', '111', '500', '9', 'Hair care', ''],
  ['Comb', '222', '99', '50', 'Tools', ''],
  ['Minus stock', '333', '100', '-3', 'Tools', ''],
  ['Hex Key', '444', 'abc', '', 'Tools', ''],
];
const map = suggest(headers);
const shelf = [shelfProduct({})];

const inIntl = (locale: 'en' | 'hi', child: ReactElement) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'UTC', children: child }));

const review = (locale: 'en' | 'hi', drafts: ProductDraft[], categories: string[] = [], addStock = false) =>
  inIntl(locale, createElement(ImportProductReview, { drafts, setDrafts: () => {}, shelf, categories, branchId: 'loc', addStock, setAddStock: () => {}, onBack: () => {}, onImported: () => {} }));

describe('the review', () => {
  const drafts = buildDrafts(rows, map, shelf);

  it('says the negative row is not imported and why, and counts it as skipped', () => {
    const html = review('en', drafts);
    expect(html).toContain('Not imported — the stock count is negative');
    expect(html).toContain('1 row will not be imported');
    expect(html).toContain('Include');
  });

  it('flags a row that is not a number and blocks the import until it is fixed', () => {
    const html = review('en', drafts);
    expect(html).toContain('Price must be a number');
    expect(html).toContain('Fix 1 row first');
  });

  it('names the categories the file would make — and not the one the shelf has', () => {
    const html = review('en', drafts, ['Tools']);
    expect(html).toContain('1 new category will be made: Hair care');
  });

  it('refuses a file that would make too many categories, and disables the button', () => {
    const many = Array.from({ length: 51 }, (_, i) => [`P${i}`, `${5000 + i}`, '10', '1', `Note ${i}`, '']);
    const html = review('en', buildDrafts(many, map, []));
    expect(html).toContain('This would make 51 new categories');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Import 51 products<\/button>/);
  });

  it('tells the owner the file\'s stock is not used for a product already on the shelf', () => {
    expect(review('en', drafts)).toContain('is already on your shelf, so the stock in your file is not used');
  });

  it('offers to add the file\'s counts instead, and says what that does before it is chosen', () => {
    const html = review('en', drafts);
    expect(html).toContain('Leave counts as they are');
    expect(html).toContain('Add to stock');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Leave counts as they are/);
  });

  it('with Add to stock chosen, says how many products get how many units, and lets the row show it', () => {
    const html = review('en', drafts, [], true);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Add to stock/);
    expect(html).toContain('1 product gets 9 more in stock');
    expect(html).toContain('+9 to stock');
    expect(html).not.toContain('the stock in your file is not used');
  });

  it('says all of it in Hindi too', () => {
    const html = review('hi', drafts);
    expect(html).toContain('इंपोर्ट नहीं हुआ — स्टॉक ऋणात्मक है');
    expect(html).toContain('कीमत एक संख्या होनी चाहिए');
  });
});

describe('the report after the import', () => {
  const drafts = buildDrafts(rows, map, shelf);
  const result: ProductImportResult = { created: 1, updated: 1, stockAdded: 0, unitsAdded: 0, categoriesCreated: 2, categoryNames: ['Hair care', 'Tools'] };
  const done = (locale: 'en' | 'hi', r = result, addStock = false) => inIntl(locale, createElement(ImportProductDone, { result: r, drafts, addStock, headers, map, onClose: () => {} }));

  it('gives the counts and the categories the file made', () => {
    const html = done('en');
    expect(html).toContain('1 product added');
    expect(html).toContain('1 product updated');
    expect(html).toContain('New categories: Hair care, Tools');
  });

  it('lists each row that was not imported by its number in the file, with the reason', () => {
    const html = done('en');
    expect(html).toContain('Row 3 · Minus stock');
    expect(html).toContain('Not imported — the stock count is negative');
    expect(html).toContain('1 row was not imported');
  });

  it('shows how each column was read, and which were not used, so a wrong guess is caught now', () => {
    const html = done('en');
    expect(html).toContain('How we read your columns');
    expect(html).toMatch(/MRP<\/span><span[^>]*>Price \(₹\)/);
    expect(html).toContain('Not used: Notes');
  });

  it('reports the stock that was added, and stops saying the file\'s counts were not used', () => {
    const html = done('en', { ...result, stockAdded: 2, unitsAdded: 14 }, true);
    expect(html).toContain('Stock added to 2 products — 14 in all');
    expect(html).not.toContain('the stock in your file is not used');
  });

  it('says so plainly when nothing was added or changed', () => {
    expect(done('en', { created: 0, updated: 0, stockAdded: 0, unitsAdded: 0, categoriesCreated: 0, categoryNames: [] })).toContain('Nothing was added or changed.');
  });

  it('has the same report in Hindi', () => {
    const html = done('hi');
    expect(html).toContain('हमने आपके कॉलम ऐसे पढ़े');
    expect(html).toContain('पंक्ति 3 · Minus stock');
  });
});

describe('closing and refreshing', () => {
  const dialog = readFileSync(new URL('./ImportProducts.tsx', import.meta.url), 'utf8');
  const list = readFileSync(new URL('./ProductsList.tsx', import.meta.url), 'utf8');

  it('asks before throwing away a reviewed list — a tap outside or Escape must not', () => {
    expect(dialog).toMatch(/requestClose = \(\) => \(step === 'review' \? setLeaving\(true\) : onClose\(\)\)/);
    expect(dialog).toContain('onClick={busy || leaving ? undefined : requestClose}');
    expect(dialog).toContain('useDialog(dialogRef, { onClose: busy || leaving ? undefined : requestClose })');
  });

  it('reads the shelf once after an import — a second router.refresh is not also needed', () => {
    const body = list.slice(list.indexOf('const imported = async'), list.indexOf('const fail = (err: unknown)'));
    expect(body).toContain('setRows(await api.productsAll(branchId))');
    expect(body.match(/router\.refresh\(\)/g)).toHaveLength(1); // only as the fallback when the re-read fails
  });
});
