import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { Product } from '../lib/api-types';
import { ImportProductColumns } from './ImportProductColumns';
import { buildDrafts, fieldAt, FIELDS, mappingSummary, matchedAll, matchExisting, missingRequired, newCategoryNames, notImported, plainCode, plainNumber, plainPercent, reviewProblems, rowProblem, rupeeText, SAMPLE_CSV, stockNotApplied, stockToAdd, suggest, toItems, withColumnAs, type ProductDraft } from './product-import';

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

const draft = (over: Partial<ProductDraft>): ProductDraft => ({ row: 1, skipReason: null, name: 'X', price: '10', stock: '', barcode: '', sku: '', category: '', gst: '', hsn: '', cost: '', lowStock: '', existing: null, skip: false, ...over });

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
    expect(toItems([d!])).toEqual([{ mode: 'create', row: 1, name: 'Argan Oil', priceMinor: 125050, stock: 12, barcode: '890', gstRateBp: 1800, hsn: '33059090' }]);
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
    expect(toItems([d!])).toEqual([{ mode: 'update', row: 1, existingId: 'a', priceMinor: 50000, barcode: '111' }]);
  });

  it('adds the file\'s count to a product already on the shelf only when asked, and never to a new one', () => {
    const shelf = [product({ id: 'a', barcode: '111', stock: 5 })];
    const drafts = buildDrafts([['Whatever', '111', '500', '12', '', ''], ['Brand new', '222', '10', '3', '', '']], map, shelf);
    expect(toItems(drafts)[0]).not.toHaveProperty('addStock');
    expect(toItems(drafts, true)[0]).toMatchObject({ mode: 'update', existingId: 'a', addStock: 12 });
    expect(toItems(drafts, true)[1]).toMatchObject({ mode: 'create', stock: 3 });
    expect(toItems(drafts, true)[1]).not.toHaveProperty('addStock');
  });

  it('sends no addStock for a zero or an empty count', () => {
    const shelf = [product({ id: 'a', barcode: '111' }), product({ id: 'b', name: 'B', barcode: '222' })];
    const drafts = buildDrafts([['A', '111', '', '0', '', ''], ['B', '222', '', '', '', '']], map, shelf);
    for (const item of toItems(drafts, true)) expect(item).not.toHaveProperty('addStock');
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
    [{ price: '-5' }, 'negative'],
    [{ stock: '-3' }, 'negative'],
    [{ gst: '-5' }, 'negative'],
    [{ price: 'abc' }, 'priceNotNumber'],
    [{ price: '1000001' }, 'tooLarge'],
    [{ price: '1000000' }, null],
    [{ stock: '1000001' }, 'tooLarge'],
    [{ cost: '2000000' }, 'tooLarge'],
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

  it('lets a row take a code an earlier row has just let go of, and does not count a retired product as holding one', () => {
    const shelf = [product({ id: 'a', barcode: '111' }), product({ id: 'r', name: 'Retired', barcode: '444', active: false }), product({ id: 'l', name: 'Live', barcode: '333' })];
    const drafts = [
      draft({ name: 'Argan Oil', barcode: '222', existing: shelf[0]! }),
      draft({ name: 'New', barcode: '111' }),
      draft({ name: 'Retired', barcode: '333', existing: shelf[1]! }),
      draft({ name: 'Newer', barcode: '444' }),
    ];
    expect(reviewProblems(drafts, shelf)).toEqual([null, null, null, null]);
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
    expect(view('en', ['Product name', 'Qty'])).toContain('Choose which column holds the sell price.');
    expect(view('hi', ['Product name', 'Qty'])).toContain('बिक्री दाम किस कॉलम में है');
  });

  it('has every message key in Hindi that it has in English', () => {
    const keys = (o: unknown, p = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'object' && v ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(hi.products.import).sort()).toEqual(keys(en.products.import).sort());
  });
});


describe('a negative number is never imported, and the owner is told', () => {
  const headers = ['Name', 'Price', 'Qty', 'Cost'];
  const map = suggest(headers);

  it('keeps the minus sign instead of stripping it', () => {
    expect(plainNumber('-3')).toBe('-3');
    expect(plainNumber('₹ -50')).toBe('-50');
    expect(plainNumber('(25)')).toBe('-25');
    expect(plainNumber('−4')).toBe('-4');
    expect(plainNumber('Rs 99/-')).toBe('99');
    expect(plainNumber('₹1,250.50')).toBe('1250.50');
    expect(plainNumber('N/A')).toBe('');
    expect(plainNumber('Rs. 99')).toBe('99');
    expect(plainNumber('Rs.99')).toBe('99');
    expect(plainNumber('INR 1,25,000/-')).toBe('125000');
    expect(plainNumber('Rs. -50')).toBe('-50');
    expect(plainNumber('.5')).toBe('.5');
    expect(plainNumber('12.0')).toBe('12');
    expect(plainNumber('12.50')).toBe('12.50');
    expect(plainNumber('abc')).toBe('abc');
  });

  it('reads a percent the way the owner wrote it', () => {
    expect(plainPercent('18%')).toBe('18');
    expect(plainPercent(' 18 % ')).toBe('18');
    expect(plainPercent('GST 18%')).toBe('18');
    expect(plainPercent('5.0')).toBe('5');
    expect(plainPercent('-5%')).toBe('-5');
    expect(plainPercent('eighteen')).toBe('eighteen');
  });

  it('turns a code a spreadsheet wrote with a decimal back into the code', () => {
    expect(plainCode('8901234567890.0')).toBe('8901234567890');
    expect(plainCode(' 33059090.00 ')).toBe('33059090');
    expect(plainCode('AB-1.0')).toBe('AB-1.0');
    expect(plainCode('012345678905')).toBe('012345678905');
  });

  it('starts a row with a negative price, stock or cost skipped, with the reason, and sends it nowhere', () => {
    const drafts = buildDrafts([['Fine', '100', '5', '10'], ['Minus stock', '100', '-3', ''], ['Minus price', '-100', '5', ''], ['Minus cost', '100', '', '-1']], map, []);
    expect(drafts.map((d) => [d.row, d.skip, d.skipReason])).toEqual([
      [1, false, null],
      [2, true, 'negativeStock'],
      [3, true, 'negativePrice'],
      [4, true, 'negativeCost'],
    ]);
    expect(toItems(drafts).map((i) => i.name)).toEqual(['Fine']);
    expect(notImported(drafts)).toEqual([
      { row: 2, name: 'Minus stock', reason: 'negativeStock' },
      { row: 3, name: 'Minus price', reason: 'negativePrice' },
      { row: 4, name: 'Minus cost', reason: 'negativeCost' },
    ]);
  });

  it('does not count a negative row as the first of a product, so a good repeat of it still goes in', () => {
    const drafts = buildDrafts([['Gel', '-5', '', ''], ['Gel', '5', '', '']], map, []);
    expect(drafts.map((d) => d.skip)).toEqual([true, false]);
  });

  it('writes a negative amount as -₹100, not ₹-100', () => {
    expect(rupeeText('-100')).toBe('-₹100');
    expect(rupeeText('1250.50')).toBe('₹1250.50');
  });

  it('puts a negative row back as a problem to fix if the owner includes it, rather than importing it', () => {
    const [d] = buildDrafts([['Minus stock', '100', '-3', '']], map, []);
    const included = { ...d!, skip: false, skipReason: null };
    expect(reviewProblems([included], [])).toEqual(['negative']);
  });

  it('lists a repeat and a row the owner skipped with their own reasons', () => {
    const drafts = buildDrafts([['Gel', '5', '', ''], ['gel', '6', '', '']], map, []);
    drafts.push(draft({ row: 3, name: 'Mine', skip: true, skipReason: 'owner' }));
    expect(notImported(drafts).map((r) => r.reason)).toEqual(['repeat', 'owner']);
  });
});

describe('what the review and the report tell the owner', () => {
  it('names the categories a file would make, once each, and not the ones the branch has', () => {
    const drafts = [draft({ category: 'Hair care' }), draft({ category: 'hair care ' }), draft({ category: 'Tools' }), draft({ category: 'Skin' }), draft({ category: 'Nope', skip: true }), draft({ category: '' })];
    expect(newCategoryNames(drafts, ['skin'])).toEqual(['Hair care', 'Tools']);
  });

  it('counts the stock numbers that will not be used because the product is already on the shelf', () => {
    const drafts = [draft({ stock: '5', existing: product({}) }), draft({ stock: '', existing: product({}) }), draft({ stock: '5' }), draft({ stock: '5', existing: product({}), skip: true })];
    expect(stockNotApplied(drafts)).toBe(1);
  });

  it('totals the stock a delivery would add, skipping rows that carry none or are skipped', () => {
    const drafts = [
      draft({ stock: '5', existing: product({}) }),
      draft({ stock: '7', existing: product({ id: 'p2' }) }),
      draft({ stock: '0', existing: product({ id: 'p3' }) }),
      draft({ stock: '9', existing: product({ id: 'p4' }), skip: true }),
      draft({ stock: '4' }),
    ];
    expect(stockToAdd(drafts)).toEqual({ count: 2, units: 12 });
    expect(stockNotApplied(drafts, true)).toBe(0);
  });

  it('refuses a delivery that would take a count past a million, and only when adding', () => {
    const d = draft({ stock: '600000', existing: product({ stock: 500_000 }) });
    expect(rowProblem(d)).toBeNull();
    expect(rowProblem(d, true)).toBe('stockTooLarge');
    expect(rowProblem(draft({ stock: '5', existing: product({ stock: 10 }) }), true)).toBeNull();
  });

  it('says which column became what, and which were not used', () => {
    const headers = ['Product name', 'MRP', 'Notes', 'Qty'];
    expect(mappingSummary(headers, suggest(headers))).toEqual({
      used: [
        { column: 'Product name', field: 'name' },
        { column: 'MRP', field: 'price' },
        { column: 'Qty', field: 'stock' },
      ],
      unused: ['Notes'],
    });
  });
});
