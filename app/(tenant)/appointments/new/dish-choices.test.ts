import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { choiceName, groupNeeds } from './ChoiceSheet';
import { canAddSize, groupProductLines, productLineKey } from '../../lib/till-sizes';
import type { AddonGroup, Product, TillSize } from '../../lib/api-types';

/** Jira GRW-712 — a dish's choices at the till. */
const sheet = readFileSync(join(__dirname, 'ChoiceSheet.tsx'), 'utf8');
const flow = readFileSync(join(__dirname, 'PayFlow.tsx'), 'utf8');

const pizza = { id: 'p', name: 'Margherita', priceMinor: '19900' } as unknown as Product;
const large = { id: 'L', option1: 'Large', option2: null, priceMinor: '29900', stock: 0 } as unknown as TillSize;
const extras: AddonGroup = { id: 'e', name: 'Extras', pick: 'many', required: false, minPicks: 0, maxPicks: 2, options: [] };
const spice: AddonGroup = { id: 's', name: 'Spice', pick: 'one', required: true, minPicks: 1, maxPicks: 1, options: [] };

describe('FR-04 — the line says what was chosen', () => {
  it('"Margherita (Large) + Cheese, Mild"; no add-ons is the plain name', () => {
    expect(choiceName(pizza, large, [{ name: 'Cheese' }, { name: 'Mild' }])).toBe('Margherita (Large) + Cheese, Mild');
    expect(choiceName(pizza, undefined, [])).toBe('Margherita');
  });
});

describe('AC-02 · AC-04 — what a group still needs', () => {
  it('a required pick-one says "Pick one" until picked; an optional group needs nothing', () => {
    expect(groupNeeds(spice, 0)).toBe('pickOne');
    expect(groupNeeds(spice, 1)).toBeNull();
    expect(groupNeeds(extras, 0)).toBeNull();
  });

  it('Add stays disabled while anything is unmet; a group at its max greys its other options; a ₹0 option shows no price', () => {
    expect(sheet).toContain('disabled={!ready}');
    expect(sheet).toContain('disabled={!on && atMax}');
    expect(sheet).toContain('{o.priceMinor > 0 ? <span className="dc-option-price">+{money(o.priceMinor)}</span> : null}');
  });
});

describe('one line per set of choices, and the same choices again on "+"', () => {
  it('the same dish with other add-ons is another line; the same add-ons in another order is the same line', () => {
    expect(productLineKey('p', 'L', ['b', 'a'])).toBe(productLineKey('p', 'L', ['a', 'b']));
    expect(productLineKey('p', 'L', ['a'])).not.toBe(productLineKey('p', 'L'));
    const sold = groupProductLines(
      [{ product: { id: 'p', variantId: 'L', addons: ['a'] } }, { product: { id: 'p', variantId: 'L', addons: ['a'] } }, { product: { id: 'p', variantId: 'L' } }],
      [33_900, 33_900, 29_900],
    );
    expect(sold).toEqual([
      { productId: 'p', variantId: 'L', addons: ['a'], qty: 2, paidMinor: 67_800 },
      { productId: 'p', variantId: 'L', qty: 1, paidMinor: 29_900 },
    ]);
  });

  it('FR-05 — "+" on a line with choices repeats them', () => {
    expect(flow).toContain('if (again?.product?.addons && again.product.addons.length > 0) {');
  });

  it('a kitchen counts no portions: every size can go on', () => {
    expect(canAddSize(large, 5, false)).toBe(true);
    expect(canAddSize(large, 0, true)).toBe(false);
  });
});

describe('plain words, both languages', () => {
  it('no "variant" or "modifier"', () => {
    for (const k of ['portion', 'pickOne', 'ruleMany', 'add'] as const) {
      expect(en.payFlow.choices[k]).toBeTruthy();
      expect(hi.payFlow.choices[k]).toBeTruthy();
    }
    expect(JSON.stringify(en.payFlow.choices) + JSON.stringify(en.products.choices)).not.toMatch(/variant|modifier|KOT/i);
  });
});
