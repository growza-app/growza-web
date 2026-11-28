import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { growthMessage } from './growth-messages';

/** Owner, 2026-11-28 — Reports › Customers: three lists that help a shop grow, each a person to message. */
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

describe('the WhatsApp lines', () => {
  it('name the shop, never the customer, never "Hi", English only, no heart', () => {
    for (const k of ['once', 'less', 'season'] as const) {
      const m = growthMessage(k, 'Kids Corner Uniforms');
      expect(m, k).toContain('Kids Corner Uniforms');
      expect(m, k).not.toMatch(/\bhi\b|hello|dear|❤|♥/i);
      expect(m, k).toMatch(/^[\x20-\x7E]+$/);
    }
    expect(growthMessage('once', null)).toContain('our shop');
  });
});

describe('where the lists sit', () => {
  it('only on a shop’s Customers tab: the restaurant’s Guests tab is unchanged', () => {
    expect(read('RestaurantReports.tsx')).toContain("{words === 'shop' && data.growth ? <GrowthLists growth={data.growth} /> : null}");
  });
  it('five, then "See all" up to the twenty sent; a list with nobody is not drawn; the count alone for someone who may not see names', () => {
    const src = read('GrowthLists.tsx');
    expect(src).toContain('const SHOWN = 5;');
    expect(src).toContain('growth.boughtOnce.count > 0 ?');
    expect(src).toContain('season && season.count > 0 ?');
    expect(src).toContain("if (rows.length === 0) {");
  });
  it('speaks English and Hindi', () => {
    for (const m of [en, hi]) for (const k of ['onceTitle', 'lessTitle', 'seasonTitle', 'seeAll', 'waAria'] as const) expect(m.customerGrowth[k]).toBeTruthy();
  });
});
