import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterShelf, SHELF_FILTERS, sortShelf } from './ProductsList';
import { NO_CATEGORY } from './DeskProductCategories';
import type { Product } from '../lib/api-types';

const p = (
  name: string,
  stock = 5,
  active = true,
  codes: { sku?: string; barcode?: string; priceMinor?: string; costMinor?: string | null; lowStockAt?: number; categoryId?: string | null } = {},
): Product => ({
  id: name,
  name,
  priceMinor: codes.priceMinor ?? '45000',
  currency: 'INR',
  stock,
  imageUrl: null,
  active,
  locationId: 'b',
  sold: 0,
  costMinor: codes.costMinor ?? null,
  lowStockAt: codes.lowStockAt ?? 0,
  categoryId: codes.categoryId ?? null,
  categoryName: null,
  sku: codes.sku ?? null,
  barcode: codes.barcode ?? null,
  gstRateBp: null,
  hsn: null,
});
const shelf = [p('Keratin Shampoo'), p('Argan Oil'), p('Old Serum', 1, false)];

describe('the Products screen finds a product however it is spelled (GRW-375 matcher)', () => {
  it('"shampo" finds Keratin Shampoo; "argon" finds Argan Oil', () => {
    expect(filterShelf(shelf, 'all', 'shampo').map((x) => x.name)).toEqual(['Keratin Shampoo']);
    expect(filterShelf(shelf, 'all', 'argon').map((x) => x.name)).toEqual(['Argan Oil']);
  });
  it('one letter is not a search yet: the whole shelf stays', () => {
    expect(filterShelf(shelf, 'all', 's').length).toBe(2);
    expect(filterShelf(shelf, 'all', 'sh').map((x) => x.name)).toEqual(['Keratin Shampoo']);
  });
  it('the chip narrows first: a retired product is found only under Retired', () => {
    expect(filterShelf(shelf, 'all', 'serum')).toEqual([]);
    expect(filterShelf(shelf, 'retired', 'serum').map((x) => x.name)).toEqual(['Old Serum']);
  });
  it('filters by multiple selected categories or No category when an array of category IDs is passed', () => {
    const catShelf = [
      p('Keratin Shampoo', 5, true, { categoryId: 'cat-hair' }),
      p('Face Wash', 5, true, { categoryId: 'cat-skin' }),
      p('Beard Oil', 5, true, { categoryId: 'cat-beard' }),
      p('Plain Comb', 5, true, { categoryId: null }),
    ];
    expect(filterShelf(catShelf, 'all', '', []).map((x) => x.name)).toEqual([
      'Keratin Shampoo',
      'Face Wash',
      'Beard Oil',
      'Plain Comb',
    ]);
    expect(filterShelf(catShelf, 'all', '', ['cat-hair', 'cat-beard']).map((x) => x.name)).toEqual([
      'Keratin Shampoo',
      'Beard Oil',
    ]);
    expect(filterShelf(catShelf, 'all', '', ['cat-skin', NO_CATEGORY]).map((x) => x.name)).toEqual([
      'Face Wash',
      'Plain Comb',
    ]);
  });
});

describe('Jira GRW-574 — the Products screen finds a product by its SKU or barcode', () => {
  const coded = [
    p('Argan Oil', 5, true, { sku: 'ARG-100', barcode: '8901234567890' }),
    p('Argan Mask', 5, true, { sku: 'ARG-200', barcode: '8901234567891' }),
    p('Keratin Shampoo', 5, true, { sku: 'KER-1' }),
  ];
  it('AC-01: typing ARG-100 finds Argan Oil, in any letters, and ranks it first', () => {
    expect(filterShelf(coded, 'all', 'ARG-100')[0]!.name).toBe('Argan Oil');
    expect(filterShelf(coded, 'all', 'arg-100').map((x) => x.name)).toEqual(['Argan Oil']);
  });
  it('a code typed from its start lists every product it could be', () => {
    expect(filterShelf(coded, 'all', 'arg-').map((x) => x.name).sort()).toEqual(['Argan Mask', 'Argan Oil']);
  });
  it('a whole barcode finds only its own product, never a neighbour one digit off, and "89"/"890" does not match every Indian barcode', () => {
    expect(filterShelf(coded, 'all', '8901234567890').map((x) => x.name)).toEqual(['Argan Oil']);
    expect(filterShelf(coded, 'all', '89')).toEqual([]);
    expect(filterShelf(coded, 'all', '890')).toEqual([]);
  });
  it('a product with no codes is still found by name', () => {
    expect(filterShelf(coded, 'all', 'keratin').map((x) => x.name)).toEqual(['Keratin Shampoo']);
  });
});

describe('Products status filter, column sorting, and save confirmation', () => {
  const mixed = [
    p('Argan Oil', 14, true, { priceMinor: '45000', costMinor: null, lowStockAt: 3 }),
    p('Face Wash', 4, true, { priceMinor: '18000', costMinor: '11000', lowStockAt: 5 }),
    p('Beard Oil', 0, true, { priceMinor: '18000', costMinor: '12000', lowStockAt: 2 }),
    p('Old Tonic', 8, false, { priceMinor: '30000', costMinor: '15000' }),
  ];

  it('the In stock, Low, and Out filters partition live products without overlap', () => {
    expect(SHELF_FILTERS).toEqual(['all', 'inStock', 'low', 'out', 'retired']);
    expect(filterShelf(mixed, 'inStock', '').map((x) => x.name)).toEqual(['Argan Oil']);
    expect(filterShelf(mixed, 'low', '').map((x) => x.name)).toEqual(['Face Wash']);
    expect(filterShelf(mixed, 'out', '').map((x) => x.name)).toEqual(['Beard Oil']);
  });

  it('sorts every table column in both directions and keeps missing costs at the foot', () => {
    expect(sortShelf(mixed.slice(0, 3), 'name', 'asc').map((x) => x.name)).toEqual(['Argan Oil', 'Beard Oil', 'Face Wash']);
    expect(sortShelf(mixed.slice(0, 3), 'name', 'desc').map((x) => x.name)).toEqual(['Face Wash', 'Beard Oil', 'Argan Oil']);
    expect(sortShelf(mixed.slice(0, 3), 'price', 'desc').map((x) => x.name)).toEqual(['Argan Oil', 'Beard Oil', 'Face Wash']);
    expect(sortShelf(mixed.slice(0, 3), 'price', 'asc').map((x) => x.name)).toEqual(['Beard Oil', 'Face Wash', 'Argan Oil']);
    expect(sortShelf(mixed.slice(0, 3), 'cost', 'asc').map((x) => x.name)).toEqual(['Face Wash', 'Beard Oil', 'Argan Oil']);
    expect(sortShelf(mixed.slice(0, 3), 'cost', 'desc').map((x) => x.name)).toEqual(['Beard Oil', 'Face Wash', 'Argan Oil']);
    expect(sortShelf(mixed.slice(0, 3), 'stock', 'asc').map((x) => x.name)).toEqual(['Beard Oil', 'Face Wash', 'Argan Oil']);
    expect(sortShelf(mixed.slice(0, 3), 'stock', 'desc').map((x) => x.name)).toEqual(['Argan Oil', 'Face Wash', 'Beard Oil']);
    expect(sortShelf(mixed.slice(0, 3), 'status', 'asc').map((x) => x.name)).toEqual(['Beard Oil', 'Face Wash', 'Argan Oil']);
    expect(sortShelf(mixed.slice(0, 3), 'status', 'desc').map((x) => x.name)).toEqual(['Argan Oil', 'Face Wash', 'Beard Oil']);
  });

  it('wires sortable headers on all five desk columns and shows Saved confirmation on the sheet', () => {
    const listSrc = readFileSync(join(__dirname, 'ProductsList.tsx'), 'utf8');
    const sheetSrc = readFileSync(join(__dirname, 'ProductSheet.tsx'), 'utf8');
    for (const col of ['name', 'price', 'cost', 'stock', 'status']) {
      expect(listSrc, col).toMatch(new RegExp(`<SortableTh col="${col}"`));
    }
    expect(sheetSrc).toMatch(/const canSave = valid && dirty;/);
    expect(sheetSrc).toMatch(/const showSaved = justSaved && !dirty && !busy;/);
    expect(sheetSrc).toMatch(/<IconCheck \/> \{t\('saved'\)\}/);
  });

  it('expands the desk table to full width when no product is open, renders the 4-card KPI strip, and keeps all product form sections open', () => {
    const listSrc = readFileSync(join(__dirname, 'ProductsList.tsx'), 'utf8');
    const sheetSrc = readFileSync(join(__dirname, 'ProductSheet.tsx'), 'utf8');
    expect(listSrc).toContain('className="prd-strip prd-strip-4"');
    expect(listSrc).toContain("t('strip.out')");
    expect(listSrc).toContain("t('cols.category')");
    expect(listSrc).toContain("t('cols.sku')");
    expect(listSrc).toContain("className={`pf-wide-grid prd-desk-grid ${editing ? 'has-sheet' : 'is-full'}`}");
    expect(sheetSrc).toContain('className="prd-form-section"');
    expect(sheetSrc).toContain('className="prd-field-grid-2"');
    expect(sheetSrc).toContain('className="prd-sheet-footer"');
    expect(sheetSrc).toContain('const [taxOpen, setTaxOpen] = useState(true)');
  });
});

