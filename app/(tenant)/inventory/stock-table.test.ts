import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const client = readFileSync(resolve(__dirname, 'KitchenStockClient.tsx'), 'utf8');
const table = readFileSync(resolve(__dirname, 'StockTable.tsx'), 'utf8');
const css = readFileSync(resolve(__dirname, '../styles/99-inventory.css'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8'));

describe('owner, 2026-11-20 — a laptop reads Inventory › Stock as one full-width table', () => {
  it('from 1101px (the Menu\'s edge) the items are a table in one card; a phone keeps its list', () => {
    expect(client).toContain("window.matchMedia('(min-width: 1101px)')");
    expect(client).toMatch(/if \(desk\) \{[\s\S]*<StockTable groups=\{groups\} onOpen=\{\(m\) => setEditing\(m\)\} \/>/);
    expect(client).toMatch(/return \(\s*<div className="ks-body">\s*\{switchCard\}\s*\{actionBar\}/);
  });

  it('the cost column is drawn only for whoever is sent a cost', () => {
    expect(table).toContain("const seesCost = groups.some((g) => g.items.some((m) => 'avgCost' in m));");
  });

  it('the column cap of 44rem is lifted on a laptop, and the actions are as wide as their words', () => {
    expect(css).toMatch(/\.ks-body\.ks-desk \{\s*max-width: none;/);
    expect(css).toMatch(/\.ks-work-head \.ks-actions,[\s\S]{0,80}display: flex;/);
  });

  it('every column is named in English and Hindi', () => {
    for (const m of [en, hi]) for (const k of ['item', 'inStock', 'lowAt', 'avgCost', 'usedIn', 'open', 'dishes']) expect(m.kitchenStock.table[k], k).toBeTruthy();
  });
});
