import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-06 — the day report says what the day's bills were charged below their price.
 *
 * Source-reading, like the other client-component tests here: there is no DOM in this suite. What matters is that
 * both day sheets show the one card, that it stays off the screen on a day with nothing to say, and that the words
 * exist in both languages.
 */
const card = readFileSync(resolve(__dirname, 'GivenAwayCard.tsx'), 'utf8');
const sheet = readFileSync(resolve(__dirname, 'DaySummarySheet.tsx'), 'utf8');
const shop = readFileSync(resolve(__dirname, 'ShopDayBody.tsx'), 'utf8');
const copy = readFileSync(resolve(__dirname, '../../lib/home-copy.ts'), 'utf8');
const types = readFileSync(resolve(__dirname, '../../lib/home-types.ts'), 'utf8');

describe('the card', () => {
  it('says how much and on how many bills', () => {
    expect(card).toMatch(/t\.billCount\(givenAway\.bills\)/);
    expect(card).toMatch(/rupees\(givenAway\.minor\)/);
    expect(card).toMatch(/\{t\.chargedBelow\} <small>\{t\.chargedBelowSub\}<\/small>/);
  });

  it('is absent on a day when every bill went out at its price, and from an API without the figure', () => {
    expect(card).toMatch(/if \(!givenAway \|\| givenAway\.bills === 0\) return null;/);
    expect((types.match(/givenAway\?: \{ minor: number; bills: number \};/g) ?? []).length).toBe(2);
  });

  it('is drawn from rows the sheet already has, not a new kind of card', () => {
    for (const cls of ['hm-card', 'hm-card-head', 'hm-rows', 'hm-row', 'hm-row-main', 'hm-row-name', 'hm-row-amount']) {
      expect(card).toContain(`"${cls}"`);
    }
  });
});

describe('both day sheets show it, as the one card', () => {
  it('a salon’s, after how the money was paid', () => {
    expect(sheet).toMatch(/<PaymentBar[^>]*variant="list" \/>\s*<\/section>\s*\{\/\*[^*]*\*\/\}\s*<GivenAwayCard t=\{t\} givenAway=\{data\.givenAway\} \/>/);
  });

  it('a shop’s', () => {
    expect(shop).toMatch(/<GivenAwayCard t=\{t\} givenAway=\{data\.givenAway\} \/>/);
  });
});

describe('the words, in both languages', () => {
  it('heading, the line under it, and the count', () => {
    expect(copy).toMatch(/chargedBelow: S\('Charged below price', 'दाम से कम लिया'\)/);
    expect(copy).toMatch(/chargedBelowSub: S\('Bills that took less than the price today', '[^']+'\)/);
    expect(copy).toMatch(/billCount: \(n: number\) => S\(n === 1 \? '1 bill' : `\$\{n\} bills`, `\$\{n\} बिल`\)/);
  });
});
