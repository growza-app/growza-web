import { describe, expect, it } from 'vitest';
import { byNameIndex, problem, toImportItems, type Draft } from './import-drafts';
import type { ServiceAdmin } from '../lib/api';

/**
 * The review table every bulk route ends in. Two of the four bugs in GRW-025
 * lived here, and both were silent — the import reported success and wrote the
 * wrong thing.
 */

const existing = (over: Partial<ServiceAdmin> = {}): ServiceAdmin =>
  ({
    id: 'svc-1',
    name: 'Haircut',
    categoryId: null,
    categoryName: 'Hair',
    durationMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    priceMinor: '30000',
    currency: 'INR',
    imageUrl: null,
    active: true,
    ...over,
  }) as ServiceAdmin;

const draft = (over: Partial<Draft> = {}): Draft => ({
  name: 'Hair Spa',
  categoryName: 'Hair',
  durationMin: '40',
  bufferAfterMin: '0',
  price: '700',
  existing: null,
  skip: false,
  ...over,
});

describe('problem', () => {
  it('accepts a complete new row', () => {
    expect(problem(draft())).toBeNull();
  });

  it('needs a name and a sensible duration', () => {
    expect(problem(draft({ name: '  ' }))).toBe('needsName');
    expect(problem(draft({ durationMin: '' }))).toBe('needsDuration');
    expect(problem(draft({ durationMin: '0' }))).toBe('needsDuration');
    expect(problem(draft({ durationMin: '721' }))).toBe('tooLong');
  });

  /**
   * The bug: `problem` returned null immediately for any row matching an existing
   * service, so a nonsense price sailed through review. `Number('abc')` is NaN,
   * `JSON.stringify` turns NaN into null, and the import erased the very price it
   * was meant to update.
   */
  it('validates the price on a duplicate row too', () => {
    expect(problem(draft({ existing: existing(), price: 'abc' }))).toBe('priceNotNumber');
    expect(problem(draft({ existing: existing(), price: '-5' }))).toBe('priceNotNumber');
  });

  it('still asks nothing else of a duplicate — it is only a re-price', () => {
    expect(problem(draft({ existing: existing(), name: '', durationMin: '' }))).toBeNull();
  });

  it('allows a blank price', () => {
    expect(problem(draft({ price: '' }))).toBeNull();
  });
});

describe('toImportItems', () => {
  it('drops skipped rows', () => {
    expect(toImportItems([draft({ skip: true }), draft({ name: 'Facial' })])).toHaveLength(1);
  });

  it('creates a new service from a fresh row', () => {
    expect(toImportItems([draft()])[0]).toEqual({
      mode: 'create',
      name: 'Hair Spa',
      categoryName: 'Hair',
      durationMin: 40,
      bufferAfterMin: 0,
      priceMinor: 70000,
    });
  });

  it('re-prices rather than duplicating a name already in the catalogue', () => {
    const item = toImportItems([draft({ name: 'Haircut', existing: existing(), price: '350' })])[0];
    expect(item).toMatchObject({ mode: 'updatePrice', existingId: 'svc-1', priceMinor: 35000 });
  });

  /**
   * A re-price sends the existing service's own duration, and the server writes
   * only the price. The review table used to let the owner edit that cell anyway,
   * so a number they typed was silently thrown away; the input is read-only now,
   * and this pins the behaviour it reflects.
   */
  it('ignores an edited duration on a duplicate, because the import cannot apply it', () => {
    const item = toImportItems([draft({ name: 'Haircut', existing: existing({ durationMin: 30 }), durationMin: '45' })])[0];
    expect(item).toMatchObject({ mode: 'updatePrice', durationMin: 30 });
  });

  it('sends a blank price as null, not as zero', () => {
    expect(toImportItems([draft({ price: '   ' })])[0]).toMatchObject({ priceMinor: null });
  });

  it('turns a blank category into null rather than an empty name', () => {
    expect(toImportItems([draft({ categoryName: '  ' })])[0]).toMatchObject({ categoryName: null });
  });

  it('trims the name it creates', () => {
    expect(toImportItems([draft({ name: '  Hair Spa  ' })])[0]).toMatchObject({ name: 'Hair Spa' });
  });
});

describe('byNameIndex', () => {
  it('matches regardless of case and surrounding space', () => {
    const idx = byNameIndex([existing({ name: '  HairCut ' })]);
    expect(idx.get('haircut')?.id).toBe('svc-1');
  });

  it('includes retired services, so a price list brings one back rather than duplicating it', () => {
    const idx = byNameIndex([existing({ active: false })]);
    expect(idx.get('haircut')).toBeDefined();
  });
});
