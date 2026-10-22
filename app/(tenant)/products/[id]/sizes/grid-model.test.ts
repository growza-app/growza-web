import { describe, expect, it } from 'vitest';
import type { ProductSizes, Size } from '../../../lib/api-types';
import { addSecondAxis, addValues, anyStocked, cellKey, cleanCount, countOk, initialState, isDirty, layout, lockedValues, moveValue, parseValues, priceOk, problems, removeSecondAxis, removeValue, rowKey, secondOptionBlocked, setPriceText, toRequest, willRetire, type GridState } from './grid-model';

/**
 * Jira GRW-598 — the sizes grid's rules, without a browser.
 *
 * What the owner is promised: a blank is "not stocked" and a zero is "none left"; a size they blank is retired; only
 * what they changed is sent; the order they type is the order that is kept.
 */
const size = (o: Partial<Size> & Pick<Size, 'option1'>): Size => ({
  id: `id-${o.option1}-${o.option2 ?? ''}`,
  productId: 'p1',
  option2: null,
  priceMinor: null,
  sku: null,
  barcode: null,
  active: true,
  stock: 0,
  ...o,
});
const sizes = (variants: Size[], axes = [{ name: 'Size', values: variants.map((v) => v.option1) }]): ProductSizes => ({ product: { id: 'p1', name: 'Half-Sleeve Shirt', priceMinor: '45000' }, axes, variants, version: 'v1' });
const stateOf = (s: ProductSizes | null) => initialState(s);

describe('pasting a list of sizes', () => {
  it('FR-02 — commas or one per line become values, in the order typed', () => {
    expect(parseValues('24, 26, 28,30').values).toEqual(['24', '26', '28', '30']);
    expect(parseValues('24\n26\n28').values).toEqual(['24', '26', '28']);
    expect(parseValues(' S ;  M\tL ').values).toEqual(['S', 'M', 'L']);
  });

  it('a messy paste is tidied: blanks dropped, spaces collapsed', () => {
    expect(parseValues(',, 24 ,\n\n  sky   blue , ').values).toEqual(['24', 'sky blue']);
  });

  it('duplicates are collapsed, case aside, and counted so the screen can say so', () => {
    const r = parseValues('24, 26, 24, 26, 26');
    expect(r.values).toEqual(['24', '26']);
    expect(r.repeats).toBe(3);
    expect(parseValues('White, white, WHITE')).toEqual({ values: ['White'], repeats: 2 });
  });

  it('adding after what is there keeps the existing order and skips what is already listed', () => {
    const r = addValues(['24', '26'], '26, 28, 30');
    expect(r.values).toEqual(['24', '26', '28', '30']);
    expect(r.repeats).toBe(1);
    expect(r.tooMany).toBe(false);
  });

  it('forty is the most an option can hold, and the screen is told when the rest was left out', () => {
    const many = Array.from({ length: 45 }, (_, n) => `S${n}`).join(',');
    const r = addValues([], many);
    expect(r.values).toHaveLength(40);
    expect(r.tooMany).toBe(true);
  });

  it('a value is cut at the server’s forty characters', () => {
    expect(parseValues('x'.repeat(60)).values[0]).toHaveLength(40);
  });
});

describe('moving a size', () => {
  it('FR-05 — one place up or down, and nothing else moves', () => {
    expect(moveValue(['24', '26', '28'], 1, -1)).toEqual(['26', '24', '28']);
    expect(moveValue(['24', '26', '28'], 1, 1)).toEqual(['24', '28', '26']);
  });

  it('the ends stay where they are', () => {
    expect(moveValue(['24', '26'], 0, -1)).toEqual(['24', '26']);
    expect(moveValue(['24', '26'], 1, 1)).toEqual(['24', '26']);
  });
});

describe('the grid as the server has it', () => {
  it('a new product starts with one empty option named Size', () => {
    const { state, baseline } = stateOf(null);
    expect(state.axes).toEqual([{ name: 'Size', values: [] }]);
    expect(baseline.sizes).toEqual([]);
  });

  it('every size’s count is in its cell, a zero stays a zero', () => {
    const { state } = stateOf(sizes([size({ option1: '28', stock: 0 }), size({ option1: '30', stock: 11 })]));
    expect(state.counts[cellKey('28', null)]).toBe('0');
    expect(state.counts[cellKey('30', null)]).toBe('11');
  });

  it('a row’s price is shown when its sizes share one, in rupees, and left blank when they differ', () => {
    const { state } = stateOf(
      sizes(
        [size({ option1: '28', option2: 'White', priceMinor: '45000' }), size({ option1: '28', option2: 'Blue', priceMinor: '45000' }), size({ option1: '30', option2: 'White', priceMinor: '45000' }), size({ option1: '30', option2: 'Blue', priceMinor: '50000' })],
        [{ name: 'Size', values: ['28', '30'] }, { name: 'Colour', values: ['White', 'Blue'] }],
      ),
    );
    expect(state.prices[rowKey('28')]).toBe('450');
    expect(state.prices[rowKey('30')]).toBe('');
  });

  it('two options lay out as rows by columns; one option as rows and one plain column', () => {
    const two = stateOf(sizes([size({ option1: '28', option2: 'White' })], [{ name: 'Size', values: ['28'] }, { name: 'Colour', values: ['White', 'Blue'] }])).state;
    expect(layout(two)).toEqual({ rows: ['28'], columns: ['White', 'Blue'] });
    const one = stateOf(sizes([size({ option1: '28' })])).state;
    expect(layout(one)).toEqual({ rows: ['28'], columns: [null] });
  });
});

describe('blank is not stocked, zero is none left', () => {
  it('BR-02 — a blank cell sends nothing; a zero sends a size with a count of 0', () => {
    const { state, baseline } = stateOf(null);
    state.axes = [{ name: 'Size', values: ['28', '30', '32'] }];
    state.counts = { [cellKey('28', null)]: '0', [cellKey('30', null)]: '', [cellKey('32', null)]: '4' };
    expect(toRequest(state, baseline).cells).toEqual([
      { option1: '28', stock: 0 },
      { option1: '32', stock: 4 },
    ]);
  });

  it('AC-03 — Size × Colour with 30/Blue left blank sends no 30/Blue', () => {
    const { state, baseline } = stateOf(null);
    state.axes = [{ name: 'Size', values: ['28', '30'] }, { name: 'Colour', values: ['White', 'Blue'] }];
    state.counts = { [cellKey('28', 'White')]: '3', [cellKey('28', 'Blue')]: '3', [cellKey('30', 'White')]: '3', [cellKey('30', 'Blue')]: '' };
    const sent = toRequest(state, baseline).cells.map((c) => `${c.option1}/${c.option2}`);
    expect(sent).toEqual(['28/White', '28/Blue', '30/White']);
  });

  it('anyStocked is false for an entirely blank grid, true with a single zero', () => {
    const { state, baseline } = stateOf(null);
    state.axes = [{ name: 'Size', values: ['28'] }];
    expect(anyStocked(state, baseline)).toBe(false);
    state.counts = { [cellKey('28', null)]: '0' };
    expect(anyStocked(state, baseline)).toBe(true);
  });

  it('an untouched retired size’s old count does not make a blank grid look stocked: nothing would be sent', () => {
    const { state, baseline } = stateOf(sizes([size({ option1: '28', stock: 5 }), size({ option1: '38', stock: 2, active: false })]));
    state.counts[cellKey('28', null)] = '';
    expect(anyStocked(state, baseline)).toBe(false);
  });
});

describe('only what changed is sent', () => {
  const loaded = sizes([size({ option1: '28', stock: 5, priceMinor: '45000' }), size({ option1: '30', stock: 8 })]);

  it('a count left alone is not sent, so a sale made meanwhile is not undone by a stale number', () => {
    const { state, baseline } = stateOf(loaded);
    expect(toRequest(state, baseline).cells).toEqual([{ option1: '28' }, { option1: '30' }]);
  });

  it('a count the owner changed is sent', () => {
    const { state, baseline } = stateOf(loaded);
    state.counts[cellKey('30', null)] = '12';
    expect(toRequest(state, baseline).cells).toEqual([{ option1: '28' }, { option1: '30', stock: 12 }]);
  });

  it('a price is sent only for a row the owner typed into, in paise; blank sends null to go back to the product’s price', () => {
    const { state, baseline } = stateOf(loaded);
    state.prices[rowKey('30')] = '520.50';
    state.priceEdited[rowKey('30')] = true;
    state.prices[rowKey('28')] = '';
    state.priceEdited[rowKey('28')] = true;
    expect(toRequest(state, baseline).cells).toEqual([{ option1: '28', priceMinor: null }, { option1: '30', priceMinor: 52050 }]);
  });

  it('the version the screen loaded goes with the save', () => {
    const { state, baseline } = stateOf(loaded);
    expect(toRequest(state, baseline).version).toBe('v1');
  });

  it('the request names the option and keeps the order', () => {
    const { state, baseline } = stateOf(null);
    state.axes = [{ name: ' Size ', values: ['30', '28'] }];
    state.counts = { [cellKey('30', null)]: '1', [cellKey('28', null)]: '1' };
    const req = toRequest(state, baseline);
    expect(req.axes).toEqual([{ name: 'Size', values: ['30', '28'] }]);
    expect(req.cells.map((c) => c.option1)).toEqual(['30', '28']);
  });

  it('an option left with no values is not sent at all', () => {
    const { state, baseline } = stateOf(null);
    state.axes = [{ name: 'Size', values: ['S'] }, { name: 'Colour', values: [] }];
    state.counts = { [cellKey('S', null)]: '1' };
    expect(toRequest(state, baseline).axes).toEqual([{ name: 'Size', values: ['S'] }]);
  });
});

describe('FR-06 — retire, never delete', () => {
  const loaded = sizes([size({ option1: '28', stock: 5 }), size({ option1: '30', stock: 8 }), size({ option1: '38', stock: 2, active: false })]);

  it('a size on the shelf whose cell is blanked is left out of the request — the server retires it — and is listed for the owner first', () => {
    const { state, baseline } = stateOf(loaded);
    state.counts[cellKey('30', null)] = '';
    expect(toRequest(state, baseline).cells.map((c) => c.option1)).toEqual(['28']);
    expect(willRetire(state, baseline).map((s) => s.option1)).toEqual(['30']);
  });

  it('a retired size nobody touched stays retired: it is not sent', () => {
    const { state, baseline } = stateOf(loaded);
    expect(toRequest(state, baseline).cells.map((c) => c.option1)).toEqual(['28', '30']);
    expect(willRetire(state, baseline)).toEqual([]);
  });

  it('a retired size comes back when the owner changes its count', () => {
    const { state, baseline } = stateOf(loaded);
    state.counts[cellKey('38', null)] = '6';
    expect(toRequest(state, baseline).cells.find((c) => c.option1 === '38')).toEqual({ option1: '38', stock: 6 });
  });
});

describe('what blocks a save', () => {
  it('AC-02 — a count that is not a whole number is named by its size', () => {
    const { state } = stateOf(null);
    state.axes = [{ name: 'Size', values: ['28', '30'] }, { name: 'Colour', values: ['White'] }];
    state.counts = { [cellKey('28', 'White')]: '3', [cellKey('30', 'White')]: '2.5' };
    expect(problems(state)).toEqual([{ key: cellKey('30', 'White'), issue: 'count', label: '30 / White' }]);
  });

  it('a negative or non-numeric price is named by its row', () => {
    const { state } = stateOf(null);
    state.axes = [{ name: 'Size', values: ['28'] }];
    state.counts = { [cellKey('28', null)]: '3' };
    state.prices = { [rowKey('28')]: '-1' };
    expect(problems(state)).toEqual([{ key: rowKey('28'), issue: 'price', label: '28' }]);
  });

  it.each([
    ['', true],
    ['0', true],
    ['12', true],
    [' 7 ', true],
    ['-1', false],
    ['1.5', false],
    ['abc', false],
    ['12345678', false],
  ])('count %j is %s', (text, ok) => expect(countOk(text)).toBe(ok));

  it.each([
    ['', true],
    ['450', true],
    ['450.5', true],
    ['450.55', true],
    ['450.555', false],
    ['-5', false],
    ['x', false],
  ])('price %j is %s', (text, ok) => expect(priceOk(text)).toBe(ok));
});

describe('dirty', () => {
  const loaded = sizes([size({ option1: '28', stock: 5 }), size({ option1: '30', stock: 8 })]);

  it('an untouched grid is not dirty, so Save stays quiet', () => {
    const { state, baseline } = stateOf(loaded);
    expect(isDirty(state, baseline)).toBe(false);
  });

  it('a changed count, a new size, a blanked size, a reorder, a new option name and a typed price each make it dirty', () => {
    const edits: Array<(s: GridState) => void> = [
      (s) => (s.counts[cellKey('28', null)] = '6'),
      (s) => {
        s.axes[0]!.values = ['28', '30', '32'];
        s.counts[cellKey('32', null)] = '1';
      },
      (s) => (s.counts[cellKey('30', null)] = ''),
      (s) => (s.axes[0]!.values = ['30', '28']),
      (s) => (s.axes[0]!.name = 'Shoe size'),
      (s) => (s.priceEdited[rowKey('28')] = true),
    ];
    for (const edit of edits) {
      const { state, baseline } = stateOf(loaded);
      edit(state);
      expect(isDirty(state, baseline)).toBe(true);
    }
  });

  it('putting a count back to what it was is not a change', () => {
    const { state, baseline } = stateOf(loaded);
    state.counts[cellKey('28', null)] = '9';
    state.counts[cellKey('28', null)] = '5';
    expect(isDirty(state, baseline)).toBe(false);
  });
});

describe('values that already have a size', () => {
  it('cannot be taken out of their option — the size is retired instead', () => {
    const { baseline } = stateOf(sizes([size({ option1: '28', option2: 'White' }), size({ option1: '30', option2: 'Blue' })], [{ name: 'Size', values: ['28', '30'] }, { name: 'Colour', values: ['White', 'Blue'] }]));
    expect([...lockedValues(baseline, 0)].sort()).toEqual(['28', '30']);
    expect([...lockedValues(baseline, 1)].sort()).toEqual(['blue', 'white']);
  });
});

describe('what may be typed in a box', () => {
  it('a decimal is kept so it can be seen and refused, never turned into a bigger number', () => {
    expect(cleanCount('2.5')).toBe('2.5');
    expect(countOk(cleanCount('2.5'))).toBe(false);
    expect(cleanCount('1,200')).toBe('1200');
    expect(cleanCount('abc12')).toBe('12');
  });
});

describe('a price typed on a row', () => {
  const loaded = sizes([size({ option1: '28', priceMinor: '45000' }), size({ option1: '30' })]);

  it('is an edit only when it differs from what the row had; typing it back is no change', () => {
    const { state, baseline } = stateOf(loaded);
    let next = setPriceText(state, baseline, '28', '500');
    expect(next.priceEdited[rowKey('28')]).toBe(true);
    next = setPriceText(next, baseline, '28', '450');
    expect(next.priceEdited[rowKey('28')]).toBeUndefined();
    expect(isDirty(next, baseline)).toBe(false);
  });

  it('a row with no price of its own: any typed price is an edit, and blank is back to none', () => {
    const { state, baseline } = stateOf(loaded);
    let next = setPriceText(state, baseline, '30', '99');
    expect(next.priceEdited[rowKey('30')]).toBe(true);
    next = setPriceText(next, baseline, '30', '');
    expect(next.priceEdited[rowKey('30')]).toBeUndefined();
  });
});

describe('taking a value or an option out', () => {
  it('removing a size takes its counts, its price and its edit with it, so none of it is sent', () => {
    const { state, baseline } = stateOf(null);
    state.axes = [{ name: 'Size', values: ['28', '30'] }];
    state.counts = { [cellKey('28', null)]: '3', [cellKey('30', null)]: '4' };
    let next = setPriceText(state, baseline, '30', '600');
    next = removeValue(next, 0, '30');
    expect(next.axes[0]!.values).toEqual(['28']);
    expect(next.counts).toEqual({ [cellKey('28', null)]: '3' });
    expect(next.priceEdited).toEqual({});
    expect(toRequest(next, baseline).cells).toEqual([{ option1: '28', stock: 3 }]);
  });

  it('removing a colour takes every count in its column', () => {
    const { state } = stateOf(null);
    state.axes = [{ name: 'Size', values: ['28', '30'] }, { name: 'Colour', values: ['White', 'Blue'] }];
    state.counts = { [cellKey('28', 'White')]: '1', [cellKey('28', 'Blue')]: '2', [cellKey('30', 'Blue')]: '3' };
    const next = removeValue(state, 1, 'Blue');
    expect(next.counts).toEqual({ [cellKey('28', 'White')]: '1' });
  });

  it('removing the second option drops its columns; adding one starts it empty and named Colour', () => {
    const { state } = stateOf(null);
    state.axes = [{ name: 'Size', values: ['28'] }, { name: 'Colour', values: ['White'] }];
    state.counts = { [cellKey('28', 'White')]: '1' };
    expect(removeSecondAxis(state).axes).toHaveLength(1);
    expect(removeSecondAxis(state).counts).toEqual({});
    expect(addSecondAxis(removeSecondAxis(state)).axes[1]).toEqual({ name: 'Colour', values: [] });
  });

  it('a second option is blocked once sizes exist with one option, and open for a new product', () => {
    const existing = stateOf(sizes([size({ option1: '28' })]));
    expect(secondOptionBlocked(existing.state, existing.baseline)).toBe(true);
    const fresh = stateOf(null);
    expect(secondOptionBlocked(fresh.state, fresh.baseline)).toBe(false);
  });
});
