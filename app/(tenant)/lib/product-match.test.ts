import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Product } from './api-types';
import { productByCode, productMatchable } from './product-match';
import { matchItems } from './service-match';

/**
 * Jira GRW-574 (part 1) — a product found by its SKU or barcode, and a scan at the till adding it.
 *
 * AC-07: a barcode typed or scanned into the till's Products search, then Enter, puts that product on the bill once
 * and clears the box. These pin the lookup Enter uses and that both till searches hand Enter to it.
 */
const p = (id: string, codes: { sku?: string; barcode?: string } = {}, stock = 5): Product => ({
  id,
  name: id,
  priceMinor: '45000',
  currency: 'INR',
  stock,
  imageUrl: null,
  active: true,
  locationId: 'b',
  sold: 0,
  costMinor: null,
  lowStockAt: 0,
  categoryId: null,
  categoryName: null,
  sku: codes.sku ?? null,
  barcode: codes.barcode ?? null,
  gstRateBp: null,
  hsn: null,
});

const shelf = [p('Argan Oil', { sku: 'ARG-100', barcode: '8901234567890' }), p('Argan Mask', { sku: 'ARG-200', barcode: '8901234567891' }), p('Plain Comb')];

describe('productByCode — what Enter at the till adds', () => {
  it('a whole barcode, or a whole SKU in any letters, names one product', () => {
    expect(productByCode(shelf, '8901234567890')?.id).toBe('Argan Oil');
    expect(productByCode(shelf, '  arg-200 ')?.id).toBe('Argan Mask');
  });
  it('part of a code, a name, or nothing names no product, so Enter does what it did before', () => {
    expect(productByCode(shelf, 'ARG-')).toBeNull();
    expect(productByCode(shelf, 'Argan Oil')).toBeNull();
    expect(productByCode(shelf, '')).toBeNull();
    expect(productByCode(shelf, '0000000000000')).toBeNull();
  });
  it('two products answering one code (a barcode that is another product\'s SKU) add neither', () => {
    const clash = [p('One', { barcode: 'X1' }), p('Two', { sku: 'x1' })];
    expect(productByCode(clash, 'X1')).toBeNull();
  });
  it('an out-of-stock bottle is still found: the bottle in the hand is the truth', () => {
    expect(productByCode([p('Last One', { barcode: '42' }, -1)], '42')?.id).toBe('Last One');
  });
});

describe('productMatchable — the same search on every shelf screen', () => {
  it('a code ranks above a name that only looks like it, and an exact code ranks above an equal rupee price', () => {
    const list = [p('ARG Serum'), p('Argan Oil', { sku: 'ARG' })];
    expect(matchItems(list.map(productMatchable), 'arg')[0]!.id).toBe('Argan Oil');
    const priced = [p('₹450 Cream'), p('Code 450 Bottle', { sku: '450' })];
    priced[1]!.priceMinor = '99900';
    expect(matchItems(priced.map(productMatchable), '450')[0]!.id).toBe('Code 450 Bottle');
  });
  it('the Products screen, the desk till and the phone till all use it', () => {
    const here = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
    for (const f of ['../products/ProductsList.tsx', '../appointments/new/DeskServiceGrid.tsx', '../components/ServiceSheet.tsx']) {
      expect(here(f), f).toMatch(/matchItems\(pool\.map\(productMatchable\), q\)/);
    }
  });
});

describe('the till hands Enter to the code lookup (AC-07)', () => {
  const here = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
  const grid = here('../appointments/new/DeskServiceGrid.tsx');
  const sheet = here('../components/ServiceSheet.tsx');

  it('the desk grid: only on the Products tab, from the whole shelf, once, then the box clears', () => {
    expect(grid).toMatch(/onKeyDown=\{onSearchKey\}/);
    expect(grid).toMatch(/if \(e\.key !== 'Enter' \|\| e\.nativeEvent\.isComposing \|\| tab !== 'products' \|\| !onMoreProduct\) return;/);
    // The whole shelf, not the in-stock view; read from the live input so a fast hardware scanner cannot beat React state.
    expect(grid).toMatch(/productByCode\(products, e\.currentTarget\.value\)/);
    expect(grid).toMatch(/onMoreProduct\(hit\);\s*setTerm\(''\);/);
    // A full bill takes no more items from a scan, matching PayFlow.addProduct.
    expect(grid).toMatch(/if \(full\) return;/);
  });

  it('the phone sheet: only under the Products chip, from the whole shelf', () => {
    expect(sheet).toMatch(/onKeyDown=\{onSearchKey\}/);
    expect(sheet).toMatch(/!productMode \|\| !onPickProduct\) return;/);
    expect(sheet).toMatch(/productByCode\(shelf, e\.currentTarget\.value\)/);
    expect(sheet).toMatch(/onPickProduct\(hit\);\s*setTerm\(''\);/);
  });
});

describe('the product sheet carries both codes and the collapsed Tax group', () => {
  const sheet = readFileSync(resolve(__dirname, '../products/ProductSheet.tsx'), 'utf8');
  const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8')).products.form;
  const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8')).products.form;

  it('sends both on every save, blank as none, so clearing a field clears the code', () => {
    expect(sheet).toMatch(/sku: sku\.trim\(\) \|\| null,\s*barcode: barcode\.trim\(\) \|\| null,/);
  });
  it('holds Save on a barcode with a space, and says why under the field', () => {
    expect(sheet).toMatch(/const barcodeBad = barcode\.trim\(\) !== '' && !\/\^\[!-~\]\+\$\/\.test\(barcode\.trim\(\)\);/);
    expect(sheet).toMatch(/&& !barcodeBad;/);
    expect(sheet).toMatch(/aria-describedby=\{barcodeBad \? 'prd-barcode-error' : 'prd-codes-hint'\}/);
  });
  it('FR-03: Tax is collapsed until set or opened, and 0% GST (0 bp) stays distinct from not set (null)', () => {
    expect(sheet).toMatch(/useState<string>\(product\?\.gstRateBp != null \? String\(product\.gstRateBp\) : ''\)/);
    expect(sheet).toMatch(/useState\(Boolean\(product && \(product\.gstRateBp != null \|\| product\.hsn\)\)\)/);
    expect(sheet).toMatch(/gstRateBp: gstRateBp === '' \? null : Number\(gstRateBp\),\s*hsn: hsn\.trim\(\) \|\| null,/);
    expect(sheet).toMatch(/aria-expanded=\{taxOpen\}/);
  });
  it('every new word ships in English and Hindi', () => {
    for (const k of ['sku', 'barcode', 'codesHint', 'barcodeSpaces', 'skuTaken', 'barcodeTaken', 'tax', 'taxNotSet', 'gstRate', 'hsn', 'taxHint']) {
      expect(en[k], k).toBeTruthy();
      expect(hi[k], k).toBeTruthy();
    }
    expect(en.skuTaken).toContain('{name}');
    expect(hi.skuTaken).toContain('{name}');
  });
});

describe('codeHolder — the 409 that names who has the code', () => {
  it('reads the field and the holder\'s name from a 409 body', async () => {
    const { BookingConflictError } = await import('./api');
    const { codeHolder } = await import('./product-match');
    const err = new BookingConflictError('Another product at this branch has that SKU', { error: 'Another product at this branch has that SKU', field: 'sku', existing: { id: 'p1', name: 'Argan Oil' } });
    expect(codeHolder(err)).toEqual({ field: 'sku', name: 'Argan Oil' });
  });
  it('leaves a taken name, a 400 and a plain error to the sheet\'s usual words', async () => {
    const { ApiError, BookingConflictError } = await import('./api');
    const { codeHolder } = await import('./product-match');
    expect(codeHolder(new BookingConflictError('A product by that name is already on the shelf', { existing: { name: 'Argan Oil' } }))).toBeNull();
    expect(codeHolder(new ApiError(400, 'A SKU is 40 characters at most'))).toBeNull();
    expect(codeHolder(new Error('offline'))).toBeNull();
  });
});
