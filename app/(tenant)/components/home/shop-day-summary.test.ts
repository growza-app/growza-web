import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeCopy } from '../../lib/home-copy';

/**
 * The end of a SHOP's day, on the Home a shop actually opens.
 *
 * `DaySummarySheet` has always been a diary's: bookings, who turned up, no-shows, each stylist's take. A
 * restaurant writes no appointment, so `ShopHome` never rendered the sheet at all and a restaurant's Home
 * could not be asked how its day went. The API now answers in the shape of the business asking (`kind`).
 *
 * Source-reading, like the other client-component tests here: there is no DOM in this suite, and what matters
 * is that the shop's body carries the shop's rows, that both the laptop and the phone have a way in, and that
 * the words are in both languages.
 */
const body = readFileSync(resolve(__dirname, 'ShopDayBody.tsx'), 'utf8');
const sheet = readFileSync(resolve(__dirname, 'DaySummarySheet.tsx'), 'utf8');
const shopHome = readFileSync(resolve(__dirname, 'ShopHome.tsx'), 'utf8');

describe('the sheet answers in the shape it was sent', () => {
  it('switches on `kind`, rather than guessing from which figures are missing', () => {
    expect(sheet).toMatch(/data\.kind === 'shop' \?/);
    expect(sheet).toMatch(/<ShopDayBody t=\{t\} data=\{data\} onOpenBranch=\{setOpened\} \/>/);
    // One shell, one fetch, one way into a branch: the shop body replaces the rows and nothing else.
    expect(sheet).toMatch(/useState<DaySummary \| ShopDaySummary \| null>\(null\)/);
  });
});

describe('a shop’s rows', () => {
  it('are the money, the orders, where they came from and what sold', () => {
    expect(body).toMatch(/rupees\(data\.takingsMinor\)/);
    expect(body).toMatch(/t\.shop\.orderWord\(data\.orders\)/);
    expect(body).toMatch(/t\.shop\.whereFrom/);
    expect(body).toMatch(/t\.shop\.whatSold/);
    expect(body).toMatch(/data\.topSellers\.map/);
  });

  it('say which money the channel rows are, so two numbers under one heading cannot be read as one', () => {
    // The hero is what was PAID (net of returns); these are what was BILLED. With a marketplace's fee between
    // them they do not add up, and nothing but this line says why.
    expect(body).toMatch(/t\.shop\.whereFrom\} <small>\{t\.shop\.whereFromSub\}<\/small>/);
  });

  it('says "(closed)" of a branch that has shut, in the diary sheet’s own words', () => {
    expect(body).toMatch(/b\.closed \? t\.branchClosed\(b\.name\) : b\.name/);
  });

  it('carry the API’s own caveat rather than a second wording of it', () => {
    // "Billed, not received" is the Channels report's sentence; this screen prints it, it does not rewrite it.
    expect(body).toMatch(/\{data\.channelCaveat\}/);
  });

  it('read none of the diary’s figures — they are absent from the answer, not hidden', () => {
    // The FIELDS, not the words: the comments in that file explain what a counter has no use for, and a check
    // on the prose would fail on its own explanation.
    for (const field of ['data.bookings', 'data.done', 'data.notDone', 'data.staff', 'data.tokens', 'data.clients', 'bookingWord']) {
      expect(body, `a shop's day has no ${field}`).not.toContain(field);
    }
  });

  it('split by branch under the total, and only when there is a split to show', () => {
    expect(body).toMatch(/data\.branches && data\.branches\.length > 0 \?/);
    expect(body).toMatch(/onOpenBranch\(\{ id: b\.id, name: b\.name \}\)/);
  });

  it('say so when nothing sold, rather than drawing an empty list', () => {
    expect(body).toMatch(/data\.topSellers\.length === 0 \?[\s\S]*?t\.shop\.nothingSold/);
  });
});

describe('the ways in', () => {
  it('has one on a laptop and one on a phone — the toolbar button is phone-only CSS', () => {
    // `.hm-toolbar-summary` is `display: none` from 861px (styles/83-role-home.css), and this screen's phone
    // layout does not draw the toolbar at all, so neither control alone would reach both.
    expect(shopHome).toMatch(/className="hm-toolbar-summary"[\s\S]*?setSummaryOpen\(true\)/);
    expect(shopHome).toMatch(/className="hm-action" onClick=\{\(\) => setSummaryOpen\(true\)\}/);
    expect(shopHome).toMatch(/className="shp-hero-pill" onClick=\{\(\) => setSummaryOpen\(true\)\}/);
  });

  it('opens the sheet at the branch the screen is showing', () => {
    expect(shopHome).toMatch(/<DaySummarySheet[\s\S]*?locationId=\{branch\}/);
  });
});

describe('the words', () => {
  it('are in both languages', () => {
    for (const lang of ['en', 'hi'] as const) {
      const t = homeCopy(lang, {});
      for (const key of ['whereFrom', 'whereFromSub', 'whatSold', 'whatSoldSub', 'nothingSold'] as const) {
        expect(t.shop[key], `${lang} ${key}`).toBeTruthy();
      }
      expect(t.soldCount(12), `${lang} soldCount`).toBeTruthy();
      expect(t.daySummary, `${lang} daySummary`).toBeTruthy();
    }
  });

  it('reuses the count that already existed rather than a second wording of "12 sold"', () => {
    expect(body).toMatch(/t\.soldCount\(s\.units\)/);
  });
});
