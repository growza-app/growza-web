import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { partialWhy } from './FoodCostClean';

const report = readFileSync(resolve(__dirname, 'FoodCostReport.tsx'), 'utf8');
const clean = readFileSync(resolve(__dirname, 'FoodCostClean.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../../messages/hi.json'), 'utf8'));

describe('owner, 2026-11-21 — Inventory › Reports without the noise', () => {
  it('one layout at every width, drawing its own one period control', () => {
    expect(report).toContain('<MoneyShell report={report} toolbar={false}>');
    expect(report).toContain('<FoodCostClean r={r} loss={loss}');
    expect(report).not.toContain('matchMedia');
    expect(clean).toContain('export function PeriodMenu(');
    expect(clean).toContain("tc('custom')");
  });

  it('the number, its status, three figures, what needs attention, then one table at a time', () => {
    expect(clean).toContain('fc2-big is-');
    expect(clean).toContain('<dl className="fc2-stats">');
    expect(clean).toContain("tc('attention')");
    expect(clean).toContain('role="tablist"');
    for (const tab of ['dishes', 'days', 'ingredients', 'waste', 'log']) expect(clean).toContain(`key: '${tab}'`);
    // The explanations are behind ⓘ, not printed on the page.
    expect(clean).toMatch(/<Info label=\{tc\('how'\)\}>[\s\S]*tc\('howText'\)/);
  });

  it('a common owner reads rupees out of ₹100, not a percentage (owner, 2026-11-21)', () => {
    expect(clean).toContain("const per100 = (p: number | null) =>");
    expect(clean).toContain('{per100(r.totals.foodCostPct)}');
    expect(clean).not.toContain('pctText(');
    expect(en.moneyReports.foodCost.clean.perHundred).toBe('of every ₹100 you sell');
    expect(en.moneyReports.foodCost.clean.tabs.log).toBe('History');
  });

  it('every new word is in English and Hindi', () => {
    for (const m of [en, hi]) {
      const c = m.moneyReports.foodCost.clean;
      for (const k of ['how', 'sales', 'givenFree', 'attention', 'noPriceRow', 'noRecipeRow', 'addRecipes', 'tabsLabel', 'noDishes', 'custom', 'heroLabel', 'perHundred', 'statFood', 'statLoss', 'losesMoney', 'howText', 'rangeShort', 'usedNote', 'lossNote']) expect(c[k], k).toBeTruthy();
      for (const k of ['perHundred', 'cost', 'thrown', 'foundExtra']) expect(c.cols[k], k).toBeTruthy();
      for (const k of ['ok', 'warn', 'bad', 'none', 'partial', 'partialPrice', 'partialRecipe', 'partialBoth']) expect(c.status[k], k).toBeTruthy();
      for (const k of ['dishes', 'days', 'ingredients', 'waste', 'log']) expect(c.tabs[k], k).toBeTruthy();
    }
  });
});

describe('develop QA 2026-11-21, finding 5 — "Not sure yet" says why', () => {
  it('names missing prices, missing recipes, both, or neither', () => {
    expect(partialWhy(true, false)).toBe('status.partialPrice');
    expect(partialWhy(false, true)).toBe('status.partialRecipe');
    expect(partialWhy(true, true)).toBe('status.partialBoth');
    expect(partialWhy(false, false)).toBe('status.partial');
  });

  it('the price line talks about prices, not recipes', () => {
    expect(en.moneyReports.foodCost.clean.status.partialPrice).toContain('no price');
    expect(en.moneyReports.foodCost.clean.status.partialPrice).not.toContain('recipe');
    expect(clean).toContain('partialWhy(r.noPrice.dishes > 0, r.noRecipe.dishes > 0)');
  });
});

describe('develop QA 2026-11-21, finding 8 — the figure tiles are whole rupees', () => {
  it('every tile uses f.rupees, none f.money', () => {
    const tiles = clean.slice(clean.indexOf('<dl className="fc2-stats">'), clean.indexOf('</dl>'));
    expect(tiles.match(/f\.rupees\(/g)?.length).toBe(4);
    expect(tiles).not.toContain('f.money(');
  });
});
