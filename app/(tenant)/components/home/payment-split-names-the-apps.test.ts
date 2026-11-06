import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-06 — Home's "How they paid" is the counter's, and the takings above it include the delivery apps. With a
 * ₹400 Swiggy order the split read ₹400 short and said nothing. The API now sends `today.fromAppsMinor`; Home says it
 * beside the split as "Apps", so the parts add up to the day. Source-reading, like the other client-component tests.
 */
const dir = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
const hero = dir('MoneyHero.tsx');
const shop = dir('ShopHome.tsx');
const copy = dir('../../lib/home-copy.ts');
const types = dir('../../lib/api-types.ts');

describe('the line', () => {
  it('names the apps as an item of its own, in grey, and not as a way of paying', () => {
    expect(hero).toMatch(/\{apps > 0 \? \(\s*<span className="hm-line-item hm-line-apps">/);
    expect(hero).toMatch(/\{t\.fromApps\} <b>\{rupees\(apps\)\}<\/b>/);
  });

  it('does not say "all paid by cash" when apps also billed — that would be untrue of the day', () => {
    expect(hero).toMatch(/\{only && apps === 0 \? t\.allPaidBy\(/);
  });

  it('is drawn for a day of app orders alone, which has no counter split to hang it on', () => {
    expect(hero).toMatch(/if \(\(slices\.length === 0 && apps === 0\) \|\| total === 0\) return/);
    expect(shop).toMatch(/\(phoneFigures\.byPaymentMode\.length > 0 \|\| \(phoneFigures\.fromAppsMinor \?\? 0\) > 0\) && phoneFigures\.takingsMinor > 0/);
  });
});

describe('where it comes from', () => {
  it('is today only on the phone range view, and on the desk hero', () => {
    expect(shop).toMatch(/fromAppsMinor: phonePeriod === 'today' \? data\?\.today\.fromAppsMinor : undefined,/);
    expect(shop).toMatch(/appsMinor=\{phoneFigures\.fromAppsMinor\}/);
    expect(shop).toMatch(/data\.today\.fromAppsMinor \? \(/);
  });

  it('is optional on the type, so an older API reads as nothing, and has its words in both languages', () => {
    expect(types).toMatch(/fromAppsMinor\?: number;/);
    expect(copy).toMatch(/fromApps: S\('Apps', '[^']+'\)/);
  });
});
