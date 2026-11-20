import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const report = readFileSync(resolve(__dirname, 'FoodCostReport.tsx'), 'utf8');
const desk = readFileSync(resolve(__dirname, 'FoodCostDesk.tsx'), 'utf8');
const css = readFileSync(resolve(__dirname, '../../styles/99-food-cost.css'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../../messages/hi.json'), 'utf8'));

describe('owner, 2026-11-20 — Inventory › Reports on a laptop reads open, as tables', () => {
  it('from 1101px the report is FoodCostDesk; a phone keeps its folded sections', () => {
    expect(report).toContain("window.matchMedia('(min-width: 1101px)')");
    expect(report).toMatch(/desk && r\.anySales \? \([\s\S]*<FoodCostDesk r=\{r\} loss=\{loss\}/);
    expect(report).toContain('<details className="fc-more">');
  });

  it('four even figures, one "To fix" card, the sections as tables two by two only where they fit', () => {
    expect(css).toMatch(/\.fcd-kpis \{[\s\S]{0,60}grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
    expect(css).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 34rem), 1fr));');
    expect(desk).toContain("td('fixTitle')");
    for (const s of ["t('daysTitle')", "t('costliestTitle')", "t('usedTitle')", "t('lossTitle')", "t('entriesTitle')"]) expect(desk).toContain(s);
  });

  it('every column and line is in English and Hindi', () => {
    for (const m of [en, hi]) {
      const d = m.moneyReports.foodCost.desk;
      for (const k of ['foodSub', 'lossSub', 'coveredLabel', 'coveredSub', 'fixTitle']) expect(d[k], k).toBeTruthy();
      for (const k of ['day', 'sales', 'food', 'pct', 'dish', 'sold', 'item', 'qty', 'value', 'missing', 'found', 'when', 'kind', 'why', 'by']) expect(d.cols[k], k).toBeTruthy();
    }
  });
});
