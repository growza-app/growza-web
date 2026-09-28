import { describe, expect, it } from 'vitest';
import { editDistance, matchAll, matchItems, soundKey, type Matchable } from './service-match';

/**
 * Jira GRW-375 — the words a front desk actually types.
 *
 * The typo table below is the point of the whole feature: every line is a
 * spelling somebody at a desk produced, and the service they meant. It is
 * checked against a catalogue the size of a real salon's, not three names.
 */
const CATALOGUE = [
  'Haircut',
  'Advanced Haircut',
  'Men Haircut',
  'Kids Haircut (Boy)',
  'Hair Trim',
  'Hair Spa',
  'Hair Shampoo',
  'Head Shave',
  'Facial',
  'Men Facial',
  'Fruit Facial',
  'Gold Facial',
  'Hydra Facial',
  'Anti-Ageing Facial',
  'Manicure',
  'Spa Manicure',
  'Classic Manicure',
  'Manicure Premium',
  'Pedicure',
  'Spa Pedicure',
  'Eyebrow Threading',
  'Chin Threading',
  'Full Face Threading',
  'Back Waxing',
  'Face Waxing',
  'Full Arms Waxing',
  'Face Bleach',
  'Full Arms Bleach',
  'Basic Clean-up',
  'O3+ Clean-up',
  'Beard Trim',
  'Beard Styling',
  'Highlights (per streak)',
  'Global Highlights',
  'Men Hair Colour',
  "Women's Hair Color",
  'Keratin (Minimum Length)',
  'Back Massage',
  'Head Massage',
  'Face D-Tan',
  'Full Body D-Tan',
];

const cand = (names: string[]): Array<Matchable<string>> => names.map((name) => ({ item: name, text: [name] }));
const top = (query: string, n = 1): string[] => matchItems(cand(CATALOGUE), query, n);

describe('what reception types, and what it must find', () => {
  const cases: Array<[typed: string, meant: RegExp]> = [
    ['phacial', /Facial$/],
    ['fasial', /Facial$/],
    ['menicure', /^Manicure$/],
    ['haircat', /^Haircut$/],
    ['hair cut', /Haircut$/],
    ['threding', /Threading$/],
    ['waxng', /Waxing$/],
    ['bleech', /Bleach$/],
    ['clen up', /Clean-up$/],
    ['beared trim', /^Beard Trim$/],
    ['high lites', /Highlights/],
    ['kerotin', /^Keratin/],
    ['massaj', /Massage$/],
    ['shampo', /Shampoo$/],
    ['pedi', /^Pedicure$/],
    ['mani', /^Manicure$/],
    ['d tan', /D-Tan$/],
  ];

  for (const [typed, meant] of cases) {
    it(`"${typed}" finds ${meant}`, () => {
      expect(top(typed)[0] ?? '(nothing)').toMatch(meant);
    });
  }

  it('both spellings of colour find each other', () => {
    expect(matchItems(cand(CATALOGUE), 'hair colour', 2)).toContain("Women's Hair Color");
    expect(matchItems(cand(CATALOGUE), 'hair color', 2)).toContain('Men Hair Colour');
  });

  it('nonsense finds nothing rather than the nearest thing', () => {
    expect(matchItems(cand(CATALOGUE), 'xyz')).toEqual([]);
    expect(matchItems(cand(CATALOGUE), 'qqqqqq')).toEqual([]);
  });
});

describe('ranking', () => {
  it('an exact name beats a longer name containing it', () => {
    expect(top('manicure')[0]).toBe('Manicure');
  });

  it('what was typed so far ranks by how little is left: "pedi" → Pedicure before Spa Pedicure', () => {
    expect(matchItems(cand(CATALOGUE), 'pedi', 2)).toEqual(['Pedicure', 'Spa Pedicure']);
  });

  it('the whole phrase from the start wins: "fruit fac" → Fruit Facial, not Facial', () => {
    expect(top('fruit fac')[0]).toBe('Fruit Facial');
  });

  it('every typed word must match something', () => {
    // "Hair Spa" has hair, but nothing like "colour".
    expect(matchItems(cand(['Hair Spa', 'Men Hair Colour']), 'hair colour')).toEqual(['Men Hair Colour']);
  });

  it('word order does not matter', () => {
    expect(top('trim beard')[0]).toBe('Beard Trim');
  });
});

describe('a combo is found by a service inside it', () => {
  const combos: Array<Matchable<string>> = [
    { item: 'Bridal Glow', text: ['Bridal Glow', 'Facial', 'Manicure'] },
    { item: 'Gents Package', text: ['Gents Package', 'Haircut', 'Beard Trim'] },
  ];

  it('"phacial" finds the combo holding a Facial', () => {
    expect(matchItems(combos, 'phacial')).toEqual(['Bridal Glow']);
  });

  it('the combo title still matches on its own', () => {
    expect(matchItems(combos, 'bridal')).toEqual(['Bridal Glow']);
  });
});

describe('the edges', () => {
  it('one letter filters by plain "contains", in the order given — never ignored (QA)', () => {
    expect(matchItems(cand(['Haircut', 'Bleach', 'Beard Trim', 'Manicure']), 'b')).toEqual(['Bleach', 'Beard Trim']);
    expect(matchItems(cand(['Haircut', 'Manicure']), 'z')).toEqual([]);
  });

  it('an empty query returns everything, in the order given', () => {
    expect(matchItems(cand(['B', 'A']), '   ')).toEqual(['B', 'A']);
  });

  it('punctuation and case are ignored on both sides', () => {
    expect(top('O3 CLEANUP')[0]).toBe('O3+ Clean-up');
    expect(top("womens hair color")[0]).toBe("Women's Hair Color");
  });

  it('scores come back with the items, highest first', () => {
    const ranked = matchAll(cand(CATALOGUE), 'facial');
    expect(ranked[0]!.item).toBe('Facial');
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it('a name of only punctuation never throws', () => {
    expect(matchItems([{ item: 'x', text: ['+++'] }], 'facial')).toEqual([]);
  });

  it('1,000 services stay well under a keystroke per search', () => {
    const many = Array.from({ length: 1000 }, (_, i) => `${CATALOGUE[i % CATALOGUE.length]} ${i}`);
    const candidates = cand(many);
    // Warm up first: the first call pays for JIT compilation.
    for (const q of ['phacial', 'menicure']) matchItems(candidates, q, 20);
    // The MEDIAN of several rounds, against 100 ms. 25 ms on one round (it runs in ~8 ms alone) failed whenever
    // the full suite ran beside it — 33 ms on a loaded laptop — and CI on main is the deploy gate, so a
    // wall-clock blip blocked a release of code that works (release review). What this guards is an
    // order-of-magnitude regression, and 100 ms still catches that.
    const rounds: number[] = [];
    for (let r = 0; r < 5; r++) {
      const start = performance.now();
      for (const q of ['phacial', 'menicure', 'hair colour', 'pedi']) matchItems(candidates, q, 20);
      rounds.push((performance.now() - start) / 4);
    }
    rounds.sort((a, b) => a - b);
    expect(rounds[2]).toBeLessThan(100);
  });
});

describe('the pieces', () => {
  it('soundKey collapses the spellings that mean the same sound', () => {
    expect(soundKey('phacial')).toBe(soundKey('facial'));
    expect(soundKey('menicure')).toBe(soundKey('manicure'));
    expect(soundKey('kolour')).toBe(soundKey('colour'));
  });

  it('editDistance gives up once it passes max', () => {
    expect(editDistance('haircut', 'haircat', 2)).toBe(1);
    expect(editDistance('haircut', 'pedicure', 2)).toBe(3);
  });
});
