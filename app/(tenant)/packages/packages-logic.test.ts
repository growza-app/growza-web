import { describe, expect, it } from 'vitest';
import type { Offer } from '../lib/api';
import {
  isPackage,
  partsMinutes,
  partsOf,
  partsTotalMinor,
  pricedMinor,
  savingMinor,
  savingPct,
  searchPackages,
  type PricedPart,
} from './packages-logic';

const svc = (id: string, name: string, rupees: number | null, mins: number): PricedPart => ({
  id,
  name,
  priceMinor: rupees === null ? null : String(rupees * 100),
  durationMin: mins,
});

/** The design's own fixture: Bridal Complete, ₹17,300 of parts sold for ₹15,000. */
const BRIDAL_MAKEUP = svc('s1', 'Bridal Makeup', 15000, 120);
const HAIR_COLOR = svc('s2', "Women's Hair Color", 1500, 90);
const FACIAL = svc('s3', 'Facial', 800, 45);
const byId = new Map([BRIDAL_MAKEUP, HAIR_COLOR, FACIAL].map((s) => [s.id, s]));

const offer = (over: Partial<Offer>): Offer => ({
  id: 'o1',
  title: 'Bridal Complete',
  description: null,
  active: true,
  sortOrder: null,
  updatedAt: '2026-10-02T00:00:00.000Z',
  serviceIds: ['s1', 's2', 's3'],
  comboPriceMinor: '1500000',
  visibleWeekdays: null,
  visibleFrom: null,
  visibleUntil: null,
  bookingsCount: 0,
  revenueMinor: '0',
  ...over,
});

describe('which rows belong on this screen', () => {
  it('a row with a price is a package', () => {
    expect(isPackage(offer({}))).toBe(true);
  });

  it('a row with no price is an announcement, and stays on Offers', () => {
    expect(isPackage(offer({ comboPriceMinor: null }))).toBe(false);
  });

  /*
   * The one that matters for "Sum of parts". It is stored as a price equal to the parts total, NOT as
   * NULL — because NULL is the announcement predicate, and a package priced at its parts would
   * otherwise disappear from Packages and turn up on Offers instead.
   */
  it('a package charged at the sum of its parts is still a package', () => {
    const total = partsTotalMinor([BRIDAL_MAKEUP, HAIR_COLOR, FACIAL]);
    expect(isPackage(offer({ comboPriceMinor: String(total) }))).toBe(true);
  });
});

describe('the services a package sells', () => {
  it('keeps the builder’s order, not the catalogue’s', () => {
    const { parts } = partsOf(offer({ serviceIds: ['s3', 's1', 's2'] }), byId);
    expect(parts.map((p) => p.name)).toEqual(['Facial', 'Bridal Makeup', "Women's Hair Color"]);
  });

  it('counts a service that is no longer there rather than pretending it was never sold', () => {
    const { parts, missing } = partsOf(offer({ serviceIds: ['s1', 'gone', 's3'] }), byId);
    expect(parts.map((p) => p.name)).toEqual(['Bridal Makeup', 'Facial']);
    expect(missing).toBe(1);
  });

  it('a package of nothing is empty, not a crash', () => {
    expect(partsOf(offer({ serviceIds: [] }), byId)).toEqual({ parts: [], missing: 0 });
  });
});

describe('the arithmetic on a row', () => {
  const parts = [BRIDAL_MAKEUP, HAIR_COLOR, FACIAL];

  it('the parts total is what the same services cost one by one', () => {
    expect(partsTotalMinor(parts)).toBe(1730000);
  });

  it('a service with no price counts as nothing, not as NaN', () => {
    expect(partsTotalMinor([svc('s9', 'Consultation', null, 10)])).toBe(0);
  });

  it('the visit is the services’ own durations', () => {
    expect(partsMinutes(parts)).toBe(255);
  });

  it('the saving and the percent agree with the design’s own numbers', () => {
    const p = offer({ comboPriceMinor: '1500000' });
    expect(savingMinor(p, parts)).toBe(230000);
    expect(savingPct(p, parts)).toBe(13);
  });

  it('a package priced ABOVE its parts saves nothing — it never shows a negative', () => {
    const p = offer({ comboPriceMinor: '2000000' });
    expect(savingMinor(p, parts)).toBe(0);
    expect(savingPct(p, parts)).toBe(0);
  });

  it('a package of free services divides by nothing and still answers 0', () => {
    const free = [svc('s9', 'Consultation', 0, 10)];
    expect(savingPct(offer({ comboPriceMinor: '0' }), free)).toBe(0);
  });

  it('an announcement has no saving even though it has no price', () => {
    expect(savingMinor(offer({ comboPriceMinor: null }), parts)).toBe(0);
  });
});

describe('the three ways to price a package', () => {
  const total = 1730000;

  it('fixed takes rupees and stores minor units', () => {
    expect(pricedMinor('flat', total, { flat: '15000' })).toBe(1500000);
  });

  it('percent off is measured against the parts total', () => {
    expect(pricedMinor('percent', total, { percent: '15' })).toBe(1470500);
  });

  it('sum of parts IS the parts total — the mode with nothing to type', () => {
    expect(pricedMinor('sum', total, {})).toBe(total);
  });

  it('an empty amount is not zero — it is "not said yet"', () => {
    expect(pricedMinor('flat', total, { flat: '   ' })).toBeNull();
    expect(pricedMinor('percent', total, { percent: '' })).toBeNull();
  });

  it('nonsense and negatives are refused rather than rounded into a price', () => {
    expect(pricedMinor('flat', total, { flat: 'free' })).toBeNull();
    expect(pricedMinor('flat', total, { flat: '-100' })).toBeNull();
    expect(pricedMinor('percent', total, { percent: '120' })).toBeNull();
  });

  it('100% off is a real answer — it is free, not refused', () => {
    expect(pricedMinor('percent', total, { percent: '100' })).toBe(0);
  });

  it('a price with paise rounds to the nearest minor unit', () => {
    expect(pricedMinor('flat', total, { flat: '699.994' })).toBe(69999);
  });
});

describe('finding a package', () => {
  const all = [
    offer({ id: 'o1', title: 'Bridal Complete', serviceIds: ['s1', 's2', 's3'] }),
    offer({ id: 'o2', title: "Groom's Day", description: 'For the groom', serviceIds: ['s2'] }),
  ];

  it('an empty search is every package', () => {
    expect(searchPackages(all, byId, '   ')).toHaveLength(2);
  });

  it('finds one by its name, whatever the case', () => {
    expect(searchPackages(all, byId, 'BRIDAL').map((p) => p.id)).toEqual(['o1']);
  });

  it('finds one by its description', () => {
    expect(searchPackages(all, byId, 'groom').map((p) => p.id)).toEqual(['o2']);
  });

  /** The reason search takes the service map at all: owners look for the package by what is inside it. */
  it('finds one by a service it sells, which its own name never mentions', () => {
    expect(searchPackages(all, byId, 'facial').map((p) => p.id)).toEqual(['o1']);
  });

  it('a search that matches nothing returns nothing, not everything', () => {
    expect(searchPackages(all, byId, 'zzzz')).toEqual([]);
  });
});
