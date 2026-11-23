import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const share = readFileSync(resolve(__dirname, '../components/ShareOnWhatsApp.tsx'), 'utf8');
const list = readFileSync(resolve(__dirname, 'ProductsList.tsx'), 'utf8');
const table = readFileSync(resolve(__dirname, '../inventory/StockTable.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8'));

describe('develop QA 2026-11-21, L3 — a menu with no number to order on asks first', () => {
  it('the menu share says whether the message reaches anyone, and the shared hook asks with the row share’s dialog', () => {
    expect(list).toContain('void shareText.share(text, { reachable: sharePhone(branch?.phone ?? shareSession.businessPhone) != null })');
    expect(share).toContain("if (opts.reachable === false && !opts.anyway && !numberWaived())");
    expect(share).toContain('<NoNumberDialog');
  });
});

describe('develop QA 2026-11-21, L2 — "used in" is the menu, taken-off dishes said apart', () => {
  it('the table names both, in English and Hindi', () => {
    expect(table).toContain("t('table.takenOff', { n: m.usedInOff ?? 0 })");
    for (const m of [en, hi]) expect(m.kitchenStock.table.takenOff).toContain('{n}');
  });
});
