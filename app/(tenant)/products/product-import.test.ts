import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { Product } from '../lib/api-types';
import { ImportProductColumns } from './ImportProductColumns';
import { buildDrafts, fieldAt, FIELDS, matchedAll, matchExisting, missingRequired, reviewProblems, rowProblem, SAMPLE_CSV, suggest, toItems, withColumnAs, type ProductDraft } from './product-import';

/**
 * Owner, 2026-10-18 — a shelf loaded from a spreadsheet. What goes wrong is quiet: a column read as the wrong thing
 * ("Cost Price" as the price), a barcode Excel has turned into 8.9E+12, two rows that are one product, or a
 * correction that moves a count it should not touch.
 */
const product = (over: Partial<Product>): Product => ({
  id: 'p1',
  name: 'Argan Oil',
  priceMinor: '45000',
  currency: 'INR',
  stock: 5,
  imageUrl: null,
  active: true,
  locationId: 'loc',
  sold: 0,
  costMinor: null,
  lowStockAt: 0,
  categoryId: null,
  categoryName: null,
  sku: null,
  barcode: null,
  gstRateBp: null,
  hsn: null,
  ...over,
});

const draft = (over: Partial<ProductDraft>): ProductDraft => ({ name: 'X', price: '10', stock: '', barcode: '', sku: '', category: '', gst: '', hsn: '', cost: '', lowStock: '', existing: null, skip: false, ...over });

describe('which column is which', () => {
  it('reads the headers of the sample file, each to its own field', () => {
    const headers = SAMPLE_CSV.split('\n')[0]!.split(',');
    const map = suggest(headers);
    const read = Object.fromEntries(FIELDS.map((f) => [f.key, headers[map[f.key]]]));
    expect(read).toEqual({
      name: 'Product name',
      price: 'Price',
      stock: 'Stock',
      barcode: 'Barcode',
      sku: 'SKU',
      category: 'Category',
      gst: 'GST %',
      hsn: 'HSN',
      cost: 'Cost',
      lowStock: 'Low stock',
    });
  });

  it('gives "Cost Price" to the cost and "Selling Price" to the price, whichever comes first', () => {
    for (const headers of [['Item', 'Cost Price', 'Selling Price'], ['Item', 'Selling Price', 'Cost Price']]) {
      const map = suggest(headers);
      expect(headers[map.cost]).toBe('Cost Price');
      expect(headers[map.price]).toBe('Selling Price');
      expect(headers[map.name]).toBe('Item');
    }
  });

  it('does not let "Item Code" become the name, "Low stock" the count, or "HSN Code" the SKU', () => {
    const map = suggest(['Item Code', 'Item Name', 'Low stock', 'Qty', 'HSN Code', 'MRP']);
    expect(map).toMatchObject({ sku: 0, name: 1, lowStock: 2, stock: 3, hsn: 4, price: 5 });
  });

  it('uses a column once: choosing a field another column held moves it', () => {
    const map = suggest(['Name', 'Price', 'Qty']);
    const moved = withColumnAs(map, 2, 'price');
    expect(moved.price).toBe(2);
    expect(fieldAt(moved, 1)).toBeNull();
    expect(withColumnAs(moved, 2, null).price).toBe(-1);
  });

  it('asks only for the name and the price', () => {
    expect(missingRequired(suggest(['Barcode', 'Qty']))).toEqual(['name', 'price']);
    expect(matchedAll(suggest(['Name', 'MRP']))).toBe(true);
  });
});

describe('a row of the file', () => {
  const headers = ['Name', 'Barcode', 'Price', 'Stock', 'GST', 'HSN'];
  const map = suggest(headers);

  it('strips ₹ and commas from money and the % from a rate', () => {
    const [d] = buildDrafts([['Argan Oil', '890', '₹1,250.50', '12 pcs', '18 %', '33059090']], map, []);
    expect(d).toMatchObject({ price: '1250.50', stock: '12', gst: '18', barcode: '890', hsn: '33059090' });
    expect(toItems([d!])).toEqual([{ mode: 'create', name: 'Argan Oil', priceMinor: 125050, stock: 12, barcode: '890', gstRateBp: 1800, hsn: '33059090' }]);
  });

  it('keeps 0% GST as an answer, and a blank as no answer', () => {
    const [zero, blank] = buildDrafts([['A', '', '5', '', '0', ''], ['B', '', '5', '', '', '']], map, []);
    expect(toItems([zero!])[0]).toMatchObject({ gstRateBp: 0 });
    expect(toItems([blank!])[0]).not.toHaveProperty('gstRateBp');
  });

  it('is a correction when its barcode, SKU or name is already on the shelf — barcode first', () => {
    const shelf = [product({ id: 'a', name: 'Argan Oil', barcode: '111' }), product({ id: 'b', name: 'Shampoo', sku: 'SH-1' })];
    expect(matchExisting({ name: 'Other name', barcode: '111', sku: '' }, shelf)?.id).toBe('a');
    expect(matchExisting({ name: 'Other name', barcode: '', sku: 'sh-1' }, shelf)?.id).toBe('b');
    expect(matchExisting({ name: 'ARGAN oil', barcode: '', sku: '' }, shelf)?.id).toBe('a');
    expect(matchExisting({ name: 'New thing', barcode: '999', sku: '' }, shelf)).toBeNull();
  });

  it('finds a retired product by name, but not by a code it no longer holds', () => {
    const shelf = [product({ id: 'r', name: 'Old Gel', barcode: '555', active: false })];
    expect(matchExisting({ name: 'Different', barcode: '555', sku: '' }, shelf)).toBeNull();
    expect(matchExisting({ name: 'old gel', barcode: '', sku: '' }, shelf)?.id).toBe('r');
  });

  it('sends a correction only what the file filled, and never the name or the count', () => {
    const shelf = [product({ id: 'a', barcode: '111' })];
    const [d] = buildDrafts([['Whatever', '111', '500', '99', '', '']], map, shelf);
    expect(d?.existing?.id).toBe('a');
    expect(toItems([d!])).toEqual([{ mode: 'update', existingId: 'a', priceMinor: 50000, barcode: '111' }]);
  });

  it('starts the repeat of a product skipped, but not the first of it', () => {
    const drafts = buildDrafts([['Gel', '', '5', '', '', ''], ['gel', '', '6', '', '', '']], map, []);
    expect(drafts.map((d) => d.skip)).toEqual([false, true]);
    expect(toItems(drafts)).toHaveLength(1);
  });
});

describe('what blocks a row', () => {
  const cases: Array<[Partial<ProductDraft>, string | null]> = [
    [{}, null],
    [{ name: ' ' }, 'needsName'],
    [{ price: '' }, 'needsPrice'],
    [{ price: 'abc' }, 'priceNotNumber'],
    [{ price: '-5' }, 'priceNotNumber'],
    [{ stock: '1.5' }, 'stockNotWhole'],
    [{ cost: 'x' }, 'costNotNumber'],
    [{ lowStock: '2.5' }, 'lowNotWhole'],
    [{ gst: 'eighteen' }, 'gstNotNumber'],
    [{ gst: '29' }, 'gstRange'],
    [{ gst: '28' }, null],
    [{ hsn: 'ARG-1' }, 'hsnDigits'],
    [{ hsn: '123' }, 'hsnDigits'],
    [{ hsn: '33059090' }, null],
    [{ barcode: '12 34' }, 'barcodeSpaces'],
    [{ barcode: '8.90123E+12' }, 'barcodeScientific'],
    [{ barcode: '8901234567890' }, null],
    [{ name: 'x'.repeat(121) }, 'tooLong'],
    [{ sku: 'x'.repeat(41) }, 'tooLong'],
  ];
  it.each(cases)('%j → %s', (over, expected) => {
    expect(rowProblem(draft(over))).toBe(expected);
  });

  it('does not ask a correction for a name or a price it is not changing', () => {
    expect(rowProblem(draft({ name: '', price: '', existing: product({}) }))).toBeNull();
  });

  it('catches the same product twice, and a code another product holds, across rows and shelf', () => {
    const shelf = [product({ id: 'a', name: 'On shelf', barcode: '111', sku: 'S-1' })];
    const drafts = [
      draft({ name: 'New A', barcode: '222' }),
      draft({ name: 'New B', barcode: '222' }),
      draft({ name: 'New C', barcode: '111' }),
      draft({ name: 'New D', sku: 's-1' }),
      draft({ name: 'new a', skip: false }),
      draft({ name: 'Skipped', barcode: '222', skip: true }),
      draft({ name: 'On shelf', barcode: '111', existing: shelf[0]! }),
    ];
    expect(reviewProblems(drafts, shelf)).toEqual([null, 'barcodeTaken', 'barcodeTaken', 'skuTaken', 'twice', null, null]);
  });

  it('lets a retired product\'s barcode be used again', () => {
    const shelf = [product({ id: 'r', barcode: '111', active: false })];
    expect(reviewProblems([draft({ name: 'New', barcode: '111' })], shelf)).toEqual([null]);
  });
});

describe('the columns step, in both languages', () => {
  const view = (locale: 'en' | 'hi', headers: string[]) =>
    renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale,
        messages: locale === 'en' ? en : hi,
        timeZone: 'UTC',
        children: createElement(ImportProductColumns, { headers, rows: [['Oil', '12']], map: suggest(headers), onMap: () => {}, onBack: () => {}, onNext: () => {} }),
      }),
    );

  it('confirms in one line a file it understood, in the owner\'s own column names', () => {
    const html = view('en', ['Product name', 'MRP', 'Qty']);
    expect(html).toContain('matched your columns');
    expect(html).toContain('Product name');
    expect(html).toContain('Stock');
  });

  it('asks about the columns when the price is missing, and says so in Hindi too', () => {
    expect(view('en', ['Product name', 'Qty'])).toContain('Choose which column holds the price.');
    expect(view('hi', ['Product name', 'Qty'])).toContain('कीमत किस कॉलम में है');
  });

  it('has every message key in Hindi that it has in English', () => {
    const keys = (o: unknown, p = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'object' && v ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(hi.products.import).sort()).toEqual(keys(en.products.import).sort());
  });
});
