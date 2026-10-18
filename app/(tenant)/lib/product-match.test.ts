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
    expect(sheet).toMatch(/\(gstRateBp === '' \? null : Number\(gstRateBp\)\) !== \(target\.gstRateBp \?\? null\)/);
    expect(sheet).toMatch(/\(hsn\.trim\(\) \|\| null\) !== \(target\.hsn \?\? null\)/);
    expect(sheet).toMatch(/gstRateBp: gstRateBp === '' \? null : Number\(gstRateBp\),\s*hsn: hsn\.trim\(\) \|\| null,/);
    // Jira GRW-582 — the group itself is the shared TaxFields (the service form is its second place).
    expect(sheet).toMatch(/<TaxFields\s+idPrefix="prd"\s+kind="product"/);
    expect(sheet).toMatch(/open=\{taxOpen\}/);
    const fields = readFileSync(resolve(__dirname, '../components/TaxFields.tsx'), 'utf8');
    expect(fields).toMatch(/aria-expanded=\{open\}/);
  });
  it('every new word ships in English and Hindi, including the API refusal sentences', async () => {
    for (const k of ['sku', 'barcode', 'codesHint', 'barcodeSpaces', 'skuTaken', 'barcodeTaken']) {
      expect(en[k], k).toBeTruthy();
      expect(hi[k], k).toBeTruthy();
    }
    expect(en.skuTaken).toContain('{name}');
    expect(hi.skuTaken).toContain('{name}');
    const { localiseApiMessage } = await import('./api-messages');
    for (const msg of [
      'Another product at this branch has that SKU',
      'Another product at this branch has that barcode',
      'Type the barcode as it is printed, with no spaces',
      'A SKU is 40 characters at most',
      'A barcode is 64 characters at most',
      'GST rate must be between 0% and 28%',
      'An HSN code is 4 to 8 digits',
    ]) {
      expect(localiseApiMessage(msg, 'hi'), msg).not.toBe(msg);
    }
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

describe('StockPanel — Move to another branch (GRW-574 part 3)', () => {
  const panel = readFileSync(resolve(__dirname, '../products/StockPanel.tsx'), 'utf8');
  const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8')).products.ledger;
  const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8')).products.ledger;

  it('offers Move stock only to an owner/manager with at least one other branch, alongside Add stock and Remove stock tiles', () => {
    expect(panel).toMatch(/otherBranches = branches\.filter\(\(b\) => b\.id !== product\.locationId\)/);
    expect(panel).toMatch(
      /canTransfer =\s*\(session\?\.role === null \|\| session\?\.role === undefined \|\| session\?\.role === 'owner' \|\| session\?\.role === 'manager'\) && otherBranches\.length > 0/,
    );
    expect(panel).toMatch(/export const ADD_KINDS: readonly ManualMovementKind\[\] = \['received', 'returned', 'adjusted'\];/);
    expect(panel).toMatch(/export const REMOVE_KINDS: readonly ManualMovementKind\[\] = \['used', 'damaged', 'adjusted'\];/);
    expect(panel).toMatch(/if \(r === kind\) return;/);
    expect(panel).toMatch(/t\('actions\.add'\)/);
    expect(panel).toMatch(/t\('actions\.remove'\)/);
    expect(panel).toMatch(/t\('actions\.move'\)/);
    for (const k of ['add', 'remove', 'move']) {
      expect(en.actions[k], k).toBeTruthy();
      expect(hi.actions[k], k).toBeTruthy();
    }
    expect(en.reason).toBe('Reason');
    expect(hi.reason).toBeTruthy();
  });

  it('does not let a removal or transfer exceed what the source branch holds, and says how many are there (QA, 2026-10-17)', () => {
    expect(panel).toMatch(
      /const tooMany = \(kind === 'transfer' \|\| kind === 'used' \|\| kind === 'damaged'\) && Number\.isFinite\(n\) && n > shelfStock;/,
    );
    expect(panel).toMatch(/\(kind !== 'transfer' \|\| toBranchId !== ''\) &&\s*!tooMany;/);
    expect(panel).toMatch(/t\('transfer\.tooMany', \{ n: Math\.max\(product\.stock, 0\) \}\)/);
    expect(panel).not.toMatch(/warnNegative|confirmAnyway/);
  });

  it('ships transfer_out, transfer_in, and transfer copy in English and Hindi', async () => {
    expect(en.kind.transfer_out).toBe('Moved out');
    expect(en.kind.transfer_in).toBe('Moved in');
    expect(hi.kind.transfer_out).toBeTruthy();
    expect(hi.kind.transfer_in).toBeTruthy();
    for (const k of ['open', 'toBranch', 'tooMany']) {
      expect(en.transfer[k], k).toBeTruthy();
      expect(hi.transfer[k], k).toBeTruthy();
    }
    const { localiseApiMessage } = await import('./api-messages');
    expect(localiseApiMessage('Choose another branch', 'hi')).not.toBe('Choose another branch');
  });
});

describe("StockTake — count a branch's shelf in one pass (GRW-574 part 4)", () => {
  const list = readFileSync(resolve(__dirname, '../products/ProductsList.tsx'), 'utf8');
  const take = readFileSync(resolve(__dirname, '../products/StockTake.tsx'), 'utf8');
  const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8')).products.stockTake;
  const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8')).products.stockTake;

  it('parses integer counts within 0..1,000,000 and rejects blanks, decimals, negatives, or out-of-range values', async () => {
    const { parseStockTakeCount } = await import('../products/StockTake');
    expect(parseStockTakeCount(undefined, 7)).toBe(7);
    expect(parseStockTakeCount(' 12 ', 7)).toBe(12);
    expect(parseStockTakeCount('0', 7)).toBe(0);
    expect(parseStockTakeCount('-3', 7)).toBeNull();
    expect(parseStockTakeCount('-0', 7)).toBe(0);
    expect(Object.is(parseStockTakeCount('-0', 7), -0)).toBe(false);
    expect(parseStockTakeCount('', 7)).toBeNull();
    expect(parseStockTakeCount('3.5', 7)).toBeNull();
    expect(parseStockTakeCount('abc', 7)).toBeNull();
    expect(parseStockTakeCount('-100001', 7)).toBeNull();
    expect(parseStockTakeCount('1000001', 7)).toBeNull();
  });

  it('offers Stock take in the Products header for owner/manager when live products exist, and posts once to /api/v1/products/stock-take without a note field', () => {
    const css = readFileSync(resolve(__dirname, '../styles/96-products.css'), 'utf8');
    expect(list).toMatch(/live\.length > 0 && canStockTake \? \([\s\S]*setStockTakeOpen\(true\)/);
    expect(list).toMatch(/<StockTake[\s\S]*branchId=\{branchId\}/);
    expect(list).toMatch(/<ProductCategoriesDropdown[\s\S]*selected=\{selectedCategories\}/);
    expect(take).toMatch(/api\s*\.stockTakeProducts\(branchId\)/);
    expect(take).toMatch(/await api\.saveStockTake\(branchId, \{\s*counts: payload,\s*\}\);/);
    expect(take).not.toContain('prd-st-note');
    expect(take).toMatch(/matchItems\(pool\.map\(productMatchable\), q\)/);
    expect(take).toMatch(/<ProductCategoriesDropdown[\s\S]*selected=\{selectedCategories\}/);
    expect(take).toMatch(/className="prd-table prd-st-table"/);
    expect(take).toMatch(/prd-st-row-diff/);
    expect(take).toMatch(/setSaved\(true\)/);
    expect(take).toMatch(/const canSave = shelf\.length > 0 && counted && !hasInvalid && !busy && !showSaved;/);
    /*
     * QA, 2026-10-17 — a stock take writes ONLY the rows somebody counted. It used to send an absolute count for
     * every product, falling back to the number read when the screen opened, so a sale that landed while the sheet
     * was open was written back out of existence.
     */
    expect(take).toMatch(/\.filter\(\(p\) => touchedRef\.current\.has\(p\.id\)\)/);
    expect(take).not.toMatch(/const payload = shelf\.map/);
    expect(take).toMatch(/hasInvalid\s*\?\s*t\('stockTake\.sayCount'\)/);
    expect(take).toMatch(/<IconCheck \/> \{t\('form\.saved'\)\}/);
    expect(list).toMatch(/const worth = useMemo\(\(\) => shelfWorthMinor\(inCategory\), \[inCategory\]\);/);
    expect(take).toMatch(/const worth = useMemo\(\(\) => shelfWorthMinor\(countedInCategory\), \[countedInCategory\]\);/);
    expect(list).toMatch(/setFilter\(\(cur\) => \(cur === 'low' \|\| lowCount === 0 \? 'all' : 'low'\)\)/);
    const savedFn = list.match(/const stockTakeSaved = [\s\S]*?\n  \};/)?.[0] ?? '';
    expect(savedFn).toContain('router.refresh()');
    expect(savedFn).not.toContain('setStockTakeOpen(false)');
    expect(css).toMatch(/\.prd-st-row \{[\s\S]*?display:\s*flex;/);
    expect(css).toMatch(/\.prd-st-row \.prd-photo \{[\s\S]*?grid-area:\s*auto;/);
  });

  it('uses plain words ("Count stock", never "stock take" or "cycle count") and ships English and Hindi strings + API messages', async () => {
    expect(en.open).toBe('Count stock');
    expect(en.title).toBe('Count stock');
    expect(en.save).toBe('Save counts');
    for (const k of ['open', 'title', 'subtitle', 'save', 'counted', 'countedAria', 'systemStock', 'notePlaceholder', 'allMatch', 'changedCount']) {
      expect(en[k], k).toBeTruthy();
      expect(hi[k], k).toBeTruthy();
      expect(String(en[k]).toLowerCase()).not.toContain('cycle count');
      expect(String(en[k]).toLowerCase()).not.toContain('stock take');
    }
    const { localiseApiMessage } = await import('./api-messages');
    for (const msg of [
      'Only the owner can count stock.',
      'Say what the count is',
      'That count is too small',
      'Count at least one product',
      'Too many products to count at once',
      'Each product can be counted once',
    ]) {
      expect(localiseApiMessage(msg, 'hi'), msg).not.toBe(msg);
    }
  });
});


