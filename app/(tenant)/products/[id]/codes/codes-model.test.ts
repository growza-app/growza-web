import { describe, expect, it } from 'vitest';
import type { MarketplaceCode, Size } from '../../../lib/api-types';
import { arrange, parsePaste, unmappedCount } from './codes-model';

const size = (id: string, option1: string, active = true): Size => ({ id, productId: 'p1', option1, option2: null, priceMinor: null, sku: null, barcode: null, active, stock: 3 });
const code = (id: string, c: string, variantId: string | null): MarketplaceCode => ({ id, channel: 'flipkart', code: c, productId: 'p1', variantId, label: 'Shirt', productName: 'Shirt', size: null, retired: false });

describe('parsePaste — "code, size" lines, tidied', () => {
  it('takes a comma, a tab (from a sheet) or a semicolon, and trims each cell and its quotes', () => {
    const r = parsePaste('FSN1, 28\nFSN2\t30\n"FSN3";32', true);
    expect(r.badLines).toEqual([]);
    expect(r.rows).toEqual([
      { code: 'FSN1', size: '28', line: 1 },
      { code: 'FSN2', size: '30', line: 2 },
      { code: 'FSN3', size: '32', line: 3 },
    ]);
  });

  it('skips blank lines and a header row, and keeps each row’s own line number', () => {
    const r = parsePaste('code, size\n\nFSN1, 28\n  \nFSN2, 30', true);
    expect(r.rows.map((x) => [x.code, x.line])).toEqual([['FSN1', 3], ['FSN2', 5]]);
  });

  it('with sizes, a one-column line cannot be a row and is named by its line', () => {
    const r = parsePaste('FSN1, 28\nFSN2\nFSN3, 32', true);
    expect(r.badLines).toEqual([2]);
    expect(r.rows).toHaveLength(2);
  });

  it('without sizes (a school bag) one column is enough, and a size column is ignored', () => {
    const r = parsePaste('BAGCODE1\nBAGCODE2, whatever', false);
    expect(r.badLines).toEqual([]);
    expect(r.rows.map((x) => [x.code, x.size])).toEqual([['BAGCODE1', null], ['BAGCODE2', null]]);
  });

  it('a size name with a slash in it is kept whole: "30 / White"', () => {
    expect(parsePaste('FSN1, 30 / White', true).rows[0]).toMatchObject({ size: '30 / White' });
  });

  it('empty text is no rows and no bad lines', () => {
    expect(parsePaste('  \n\n', true)).toEqual({ rows: [], badLines: [] });
  });
});

describe('arrange — each size with its codes, and the codes left pointing at a retired one', () => {
  it('keeps the owner’s order, shows every live size even with no code, and drops retired sizes from the rows', () => {
    const sizes = [size('a', '28'), size('b', '30'), size('c', '32', false)];
    const { rows, orphans } = arrange(sizes, [code('1', 'X', 'b'), code('2', 'Y', 'b'), code('3', 'Z', 'c')]);
    expect(rows.map((r) => [r.size.option1, r.codes.map((c) => c.code)])).toEqual([['28', []], ['30', ['X', 'Y']]]);
    // A code on a retired size is not lost: it is listed apart so it can be repointed or removed (FR-06).
    expect(orphans.map((c) => c.code)).toEqual(['Z']);
    expect(unmappedCount(rows)).toBe(1);
  });
});
