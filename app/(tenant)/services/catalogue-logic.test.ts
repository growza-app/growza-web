import { describe, expect, it } from 'vitest';
import {
  blankRow,
  buildMatcher,
  deriveCategories,
  effectivePrice,
  fromEditRow,
  rowProblem,
  toEditRow,
  type EditRow,
  type WorkingService,
} from './catalogue-logic';

/**
 * The picker's pure logic. Every case here is one that shipped broken and was
 * found by reading rather than by a test — this file is the harness those bugs
 * argued for.
 */

const svc = (over: Partial<WorkingService> = {}): WorkingService => ({
  name: 'Haircut',
  catalogKey: 'haircut',
  category: 'Hair',
  durationMin: 30,
  bufferAfterMin: 0,
  priceMinor: 30000,
  alreadyHave: false,
  edited: false,
  ...over,
});

const never = () => false;

describe('price scaling', () => {
  it('shifts a preset', () => {
    expect(effectivePrice(svc({ priceMinor: 30000 }), 10)).toBe(33000);
    expect(effectivePrice(svc({ priceMinor: 30000 }), -50)).toBe(15000);
    expect(effectivePrice(svc({ priceMinor: 30000 }), 0)).toBe(30000);
  });

  it('leaves a price the owner typed alone', () => {
    expect(effectivePrice(svc({ priceMinor: 40000, edited: true }), 10)).toBe(40000);
  });

  it('carries a missing price through as missing', () => {
    expect(effectivePrice(svc({ priceMinor: null }), 25)).toBeNull();
  });
});

describe('the editor round trip', () => {
  /**
   * The bug this file exists for.
   *
   * `toEditRow` fills the price field with the *scaled* figure. If `fromEditRow`
   * saved that back as the base, the next render would scale it again: open a
   * category at +10%, press Save without touching anything, and every price in it
   * silently gains another 10%. Twice gives +33%.
   */
  it('does not compound the scale when nothing was touched', () => {
    const before = svc({ priceMinor: 30000 });
    let row = toEditRow(before, 'k', 10);
    expect(row.price).toBe('330'); // what the owner sees

    let after = fromEditRow(row, 'Hair', never);
    expect(after.priceMinor).toBe(30000); // what gets stored: the preset, untouched
    expect(effectivePrice(after, 10)).toBe(33000);

    // ...and again, because the first version only looked right on one pass.
    row = toEditRow(after, 'k', 10);
    after = fromEditRow(row, 'Hair', never);
    expect(after.priceMinor).toBe(30000);
  });

  it('stores a hand-typed price literally, and stops scaling it', () => {
    const row: EditRow = { ...toEditRow(svc(), 'k', 10), price: '400', edited: true };
    const after = fromEditRow(row, 'Hair', never);
    expect(after.priceMinor).toBe(40000);
    expect(effectivePrice(after, 10)).toBe(40000);
  });

  it('keeps name, duration and cleanup across the trip', () => {
    const before = svc({ name: 'Hair Spa', durationMin: 40, bufferAfterMin: 10 });
    const after = fromEditRow(toEditRow(before, 'k', 0), 'Hair', never);
    expect(after).toMatchObject({ name: 'Hair Spa', durationMin: 40, bufferAfterMin: 10 });
  });

  it('trims the name and re-checks it against the existing catalogue', () => {
    const row: EditRow = { ...toEditRow(svc(), 'k', 0), name: '  Facial  ' };
    const after = fromEditRow(row, 'Skin', (n) => n === 'facial');
    expect(after.name).toBe('Facial');
    expect(after.alreadyHave).toBe(true);
  });

  it('moves a row to the category it is saved into', () => {
    const after = fromEditRow(toEditRow(svc(), 'k', 0), 'Bridal & packages', never);
    expect(after.category).toBe('Bridal & packages');
  });

  it('saves a blank price as no price, not as zero', () => {
    const after = fromEditRow(blankRow(1, 'Hair'), 'Hair', never);
    expect(after.priceMinor).toBeNull();
  });
});

describe('rowProblem', () => {
  const row = (over: Partial<EditRow> = {}): EditRow => ({ ...toEditRow(svc(), 'k', 0), ...over });

  it('accepts a complete row', () => {
    expect(rowProblem(row())).toBeNull();
  });

  it('needs a name', () => {
    expect(rowProblem(row({ name: '   ' }))).toBe('needsName');
  });

  it('needs a positive duration', () => {
    expect(rowProblem(row({ minutes: '' }))).toBe('needsMinutes');
    expect(rowProblem(row({ minutes: '0' }))).toBe('needsMinutes');
    expect(rowProblem(row({ minutes: '-5' }))).toBe('needsMinutes');
    expect(rowProblem(row({ minutes: 'abc' }))).toBe('needsMinutes');
  });

  it('allows an empty price but not a nonsense one', () => {
    expect(rowProblem(row({ price: '' }))).toBeNull();
    expect(rowProblem(row({ price: 'abc' }))).toBe('priceNotNumber');
    expect(rowProblem(row({ price: '-1' }))).toBe('priceNotNumber');
  });
});

describe('buildMatcher', () => {
  const rows = [
    toEditRow(svc({ name: 'Haircut', category: 'Hair' }), 'a', 0),
    toEditRow(svc({ name: 'Facial', category: 'Skin' }), 'b', 0),
    toEditRow(svc({ name: 'Hair Spa', category: 'Hair' }), 'c', 0),
  ];
  const matches = (q: string, regex = false) => rows.filter(buildMatcher(q, regex).test).map((r) => r.name);

  it('matches plain text without the owner knowing what a metacharacter is', () => {
    expect(matches('hair')).toEqual(['Haircut', 'Hair Spa']);
  });

  it('searches the category as well as the name', () => {
    expect(matches('skin')).toEqual(['Facial']);
  });

  it('is case-insensitive', () => {
    expect(matches('HAIRCUT')).toEqual(['Haircut']);
  });

  it('treats a metacharacter literally in plain mode', () => {
    expect(matches('Hair.')).toEqual([]);
  });

  it('applies a real pattern in regex mode', () => {
    expect(matches('^Hair', true)).toEqual(['Haircut', 'Hair Spa']);
  });

  /**
   * Anchors used to be useless: name and category were joined into one haystack,
   * so `Spa$` ran against "Hair Spa Hair" and never matched. They are tested
   * separately now.
   */
  it('anchors against the name, not the name-plus-category', () => {
    expect(matches('cut$|Spa$', true)).toEqual(['Haircut', 'Hair Spa']);
    expect(matches('^Skin$', true)).toEqual(['Facial']);
  });

  it('reports a half-typed pattern instead of throwing, and keeps showing everything', () => {
    for (const bad of ['[', '(', '*', 'a{2,1}', '\\']) {
      const m = buildMatcher(bad, true);
      expect(m.error).toBe('invalid');
      expect(rows.every(m.test)).toBe(true);
    }
  });

  it('refuses an absurdly long pattern rather than running it', () => {
    const m = buildMatcher('a'.repeat(201), true);
    expect(m.error).toBe('tooLong');
    expect(rows.every(m.test)).toBe(true);
  });

  it('an empty query matches everything', () => {
    expect(matches('   ')).toHaveLength(3);
  });
});

describe('deriveCategories', () => {
  const services = [
    svc({ name: 'Haircut', category: 'Hair', priceMinor: 30000 }),
    svc({ name: 'Hair Spa', category: 'Hair', priceMinor: 70000 }),
    svc({ name: 'Facial', category: 'Skin', priceMinor: 80000 }),
  ];

  it('counts, samples and ranges each category', () => {
    const [hair, skin] = deriveCategories(services, ['Hair', 'Skin'], 0);
    expect(hair).toMatchObject({ name: 'Hair', count: 2, minPriceMinor: 30000, maxPriceMinor: 70000 });
    expect(hair?.sample).toEqual(['Haircut', 'Hair Spa']);
    expect(skin).toMatchObject({ name: 'Skin', count: 1, minPriceMinor: 80000, maxPriceMinor: 80000 });
  });

  it('keeps the order the vertical declared, then appends anything new', () => {
    const withNew = [...services, svc({ name: 'Threading', category: 'Threading' })];
    expect(deriveCategories(withNew, ['Hair', 'Skin'], 0).map((c) => c.name)).toEqual(['Hair', 'Skin', 'Threading']);
  });

  it('drops a category once its last service is removed', () => {
    expect(deriveCategories(services.filter((s) => s.category !== 'Skin'), ['Hair', 'Skin'], 0).map((c) => c.name)).toEqual(
      ['Hair'],
    );
  });

  it('ranges reflect the current scale', () => {
    const [hair] = deriveCategories(services, ['Hair'], 10);
    expect(hair).toMatchObject({ minPriceMinor: 33000, maxPriceMinor: 77000 });
  });

  it('a category with no priced service has no range rather than a zero one', () => {
    const [only] = deriveCategories([svc({ category: 'Hair', priceMinor: null })], ['Hair'], 0);
    expect(only).toMatchObject({ minPriceMinor: null, maxPriceMinor: null });
  });
});
