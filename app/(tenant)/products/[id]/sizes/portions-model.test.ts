import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ProductSizes, Size } from '../../../lib/api-types';
import { fromDashboard } from '../../../lib/dashboard-root';
import { addPreset, firstProblem, portionsChanged, portionsFrom, portionsRequest, type PortionRow } from './portions-model';

/**
 * A dish's portions (owner, 2026-11-23): one list of names and prices for a business that does not count what it sells.
 * What the owner is promised: every portion on the list is sold at the price shown; one taken off is retired, not lost;
 * nothing ever sends a count over an existing one.
 */
const size = (o: Partial<Size> & Pick<Size, 'option1'>): Size => ({
  id: `id-${o.option1}`,
  productId: 'p1',
  option2: null,
  priceMinor: null,
  sku: null,
  barcode: null,
  active: true,
  stock: 0,
  ...o,
});
const dish = (variants: Size[], values = variants.map((v) => v.option1)): ProductSizes => ({
  product: { id: 'p1', name: 'Chicken Biryani', priceMinor: '21000' },
  axes: values.length > 0 ? [{ name: 'Size', values }] : [],
  variants,
  version: 'v1',
});
const row = (name: string, price: string, saved = false): PortionRow => ({ id: `r-${name}`, name, price, saved });

describe('what the list shows', () => {
  it('the portions on sale, in the dish order, each with the price it sells at', () => {
    const rows = portionsFrom(dish([size({ option1: 'Full', priceMinor: '21000' }), size({ option1: 'Half', priceMinor: '14000' })], ['Half', 'Full']));
    expect(rows.map((r) => [r.name, r.price, r.saved])).toEqual([
      ['Half', '140', true],
      ['Full', '210', true],
    ]);
  });

  it('a portion with no price of its own shows the dish price, so nothing on the screen is hidden', () => {
    expect(portionsFrom(dish([size({ option1: 'Half' })]))[0]!.price).toBe('210');
  });

  it('a retired portion is not on the list', () => {
    expect(portionsFrom(dish([size({ option1: 'Half', active: false }), size({ option1: 'Full', priceMinor: '21000' })])).map((r) => r.name)).toEqual(['Full']);
  });

  it('a dish with no portions starts empty', () => {
    expect(portionsFrom(dish([]))).toEqual([]);
  });
});

describe('the presets', () => {
  it('Half and Full adds two rows to fill in, in that order', () => {
    expect(addPreset([], ['Half', 'Full']).map((r) => [r.name, r.price, r.saved])).toEqual([
      ['Half', '', false],
      ['Full', '', false],
    ]);
  });

  it('a name already on the list is not added twice, any case', () => {
    expect(addPreset([row('half', '140', true)], ['Half', 'Full']).map((r) => r.name)).toEqual(['half', 'Full']);
  });
});

describe('what Save refuses, first problem first', () => {
  it('an empty list: keep at least one', () => {
    expect(firstProblem([])).toEqual({ kind: 'none' });
  });

  it('a row with no name', () => {
    expect(firstProblem([row('', '100')])).toMatchObject({ kind: 'name' });
  });

  it('a row with no price, or a zero, or junk — every portion needs its own price', () => {
    expect(firstProblem([row('Half', '')])).toMatchObject({ kind: 'price', name: 'Half' });
    expect(firstProblem([row('Half', '0')])).toMatchObject({ kind: 'price' });
    expect(firstProblem([row('Half', '1.2.3')])).toMatchObject({ kind: 'price' });
    expect(firstProblem([row('Half', '1.234')])).toMatchObject({ kind: 'price' });
  });

  it('the same name twice, any case or spacing', () => {
    expect(firstProblem([row('Half', '140'), { ...row('half ', '150'), id: 'x' }])).toMatchObject({ kind: 'twice' });
  });

  it('a name longer than the server takes', () => {
    expect(firstProblem([row('x'.repeat(41), '100')])).toMatchObject({ kind: 'tooLong' });
  });

  it('a good list passes', () => {
    expect(firstProblem([row('Half', '140'), row('Full', '210.50')])).toBeNull();
  });
});

describe('the one request', () => {
  it('new portions: each a cell with its price and a count of 0', () => {
    const req = portionsRequest([row('Half', '140'), row('Full', '210')], dish([]));
    expect(req.axes).toEqual([{ name: 'Size', values: ['Half', 'Full'] }]);
    expect(req.cells).toEqual([
      { option1: 'Half', priceMinor: 14000, stock: 0 },
      { option1: 'Full', priceMinor: 21000, stock: 0 },
    ]);
  });

  it('an existing portion never gets a count, so whatever the server holds stays', () => {
    const req = portionsRequest([row('Half', '150', true)], dish([size({ option1: 'Half', stock: 7, priceMinor: '14000' })]));
    expect(req.cells).toEqual([{ option1: 'Half', priceMinor: 15000 }]);
    expect(req.version).toBe('v1');
  });

  it('a portion taken off has no cell (the server retires it) but keeps its name in the option, which the server requires', () => {
    const req = portionsRequest([row('Full', '210', true)], dish([size({ option1: 'Half' }), size({ option1: 'Full' })]));
    expect(req.axes[0]!.values).toEqual(['Half', 'Full']);
    expect(req.cells.map((c) => c.option1)).toEqual(['Full']);
  });

  it('typing a retired name brings that size back, with its own spelling, instead of making a second one', () => {
    const req = portionsRequest([row('half', '140')], dish([size({ option1: 'Half', active: false })]));
    expect(req.axes[0]!.values).toEqual(['Half']);
    expect(req.cells).toEqual([{ option1: 'Half', priceMinor: 14000 }]);
  });

  it('a decimal price is sent in paise, rounded', () => {
    expect(portionsRequest([row('Half', '140.5')], dish([])).cells[0]!.priceMinor).toBe(14050);
  });
});

describe('the Save bar lights only for a real change', () => {
  const loaded = [row('Half', '140', true), row('Full', '210', true)];
  it('as loaded: no change', () => expect(portionsChanged(loaded, loaded)).toBe(false));
  it('a price typed the same, written differently: no change', () => expect(portionsChanged([row('Half', '140.00', true), row('Full', '210', true)], loaded)).toBe(false));
  it('a new price, a row removed, a row added: changed', () => {
    expect(portionsChanged([row('Half', '150', true), row('Full', '210', true)], loaded)).toBe(true);
    expect(portionsChanged([row('Full', '210', true)], loaded)).toBe(true);
    expect(portionsChanged([...loaded, row('Family', '')], loaded)).toBe(true);
  });
});

describe('the screen', () => {
  const read = (rel: string) => readFileSync(fromDashboard(rel), 'utf8');
  const screen = read('app/(tenant)/products/[id]/sizes/PortionsList.tsx');
  const page = read('app/(tenant)/products/[id]/sizes/page.tsx');
  const css = read('app/(tenant)/styles/99-sizes.css');
  const en = JSON.parse(read('messages/en.json')) as { products: { sizes: Record<string, string> } };
  const hi = JSON.parse(read('messages/hi.json')) as { products: { sizes: Record<string, string> } };

  it('a kitchen (stock not counted) with one option gets the list; everyone else keeps the grid', () => {
    expect(page).toContain('const portions = !counted && sizes.axes.length <= 1;');
    expect(page).toMatch(/portions \? <PortionsList/);
    expect(page).toContain("t(portions ? 'portionsTitle' : 'title')");
  });

  it('no reordering, no option name, no count, one save request', () => {
    expect(screen).not.toMatch(/moveValue|Arrow(Up|Down)|optionName|countOf|stock:/);
    expect(screen.match(/api\.saveSizeGrid\(/g)).toHaveLength(1);
    expect(screen).toContain('portionsRequest(rows, current)');
  });

  it('every target a thumb can hit, and the fields at 1rem so iOS does not zoom them', () => {
    expect(css).toMatch(/\.prt-remove\s*{[^}]*width:\s*2\.75rem;[^}]*height:\s*2\.75rem/);
    expect(css).toMatch(/\.prt-price-input\s*{[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.prt-big\s*{[^}]*min-height:\s*3rem/);
    expect(css).toMatch(/\.prt-price-input\s*{[^}]*font-size:\s*var\(--fs-5\)/);
    expect(css).toMatch(/\.prt-name-input\s*{[^}]*font-size:\s*var\(--fs-5\)/);
  });

  it('every word in English and Hindi', () => {
    const keys = [...screen.matchAll(/t\('([a-zA-Z]+)'/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) {
      expect(en.products.sizes[k], k).toBeTruthy();
      expect(hi.products.sizes[k], k).toBeTruthy();
    }
  });
});
