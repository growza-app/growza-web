import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BuyItem } from '../lib/api-types';
import { groupBySupplier, packsFor, shareText, waLink } from './buy-list';

/** Jira GRW-739 — What to buy: grouped by supplier, shared as plain text through a manual wa.me link. */
const item = (over: Partial<BuyItem>): BuyItem => ({
  materialId: over.name ?? 'x', name: 'x', unit: 'kg', category: null, stock: 0, lowStockAt: 1000, suggestQty: 2000,
  supplierId: null, supplierName: null, supplierPhone: null, packSize: null, packLabel: null, ...over,
});
const paneer = item({ name: 'Paneer', stock: -200, suggestQty: 2200, supplierId: 'ff', supplierName: 'Fresh Farms', supplierPhone: '9876543210' });
const onion = item({ name: 'Onion', stock: 3000, lowStockAt: 5000, suggestQty: 7000, supplierId: 'dv', supplierName: 'Daily Veg' });
const eggs = item({ name: 'Eggs', unit: 'pcs', stock: 6000, lowStockAt: 30000, suggestQty: 54000, supplierId: 'ff', supplierName: 'Fresh Farms', supplierPhone: '9876543210', packSize: 30000, packLabel: 'tray' });
const salt = item({ name: 'Salt', stock: 100, lowStockAt: 500, suggestQty: 900 });
const words = { heading: (d: string) => `To buy — ${d}`, noSupplier: 'No supplier yet', packs: (n: number, label: string) => `${n} × ${label}` };
const head = { business: 'Spice Route', branch: 'Indiranagar', date: '18 Nov 2026' };
const all = (items: BuyItem[]) => new Map(items.map((i) => [i.materialId, i.suggestQty] as const));

describe('AC-01 / AC-02 — grouped by supplier, most urgent first', () => {
  it('a supplier sits where its most urgent item is; items with no supplier go last', () => {
    const g = groupBySupplier([salt, paneer, onion, eggs]);
    expect(g.map((x) => x.name)).toEqual(['Fresh Farms', 'Daily Veg', null]);
    expect(g[0]!.items.map((i) => i.name)).toEqual(['Paneer', 'Eggs']);
  });

  it('the text: business, branch, date, then each supplier (with phone) and its items; packs said for a packed item', () => {
    const items = [paneer, onion, eggs, salt];
    expect(shareText(head, groupBySupplier(items), all(items), words)).toBe(
      [
        'Spice Route · Indiranagar',
        'To buy — 18 Nov 2026',
        '',
        'Fresh Farms (9876543210)',
        '• Paneer — 2.2 kg',
        '• Eggs — 54 pcs (2 × tray)',
        '',
        'Daily Veg',
        '• Onion — 7 kg',
        '',
        'No supplier yet',
        '• Salt — 0.9 kg',
      ].join('\n'),
    );
  });

  it('FR-02 — an amount changed before sharing is what is shared; a cleared one leaves the item (and an empty supplier) off', () => {
    const items = [paneer, onion];
    const qty = new Map<string, number | null>([['Paneer', 5000], ['Onion', null]]);
    expect(shareText({ ...head, branch: null }, groupBySupplier(items), qty, words)).toBe(['Spice Route', 'To buy — 18 Nov 2026', '', 'Fresh Farms (9876543210)', '• Paneer — 5 kg'].join('\n'));
  });

  it('packs round up and never say zero', () => {
    expect(packsFor({ packSize: 30000 }, 31000)).toBe(2);
    expect(packsFor({ packSize: 30000 }, 1)).toBe(1);
    expect(packsFor({ packSize: null }, 5000)).toBeNull();
  });
});

describe('AC-02 — a manual wa.me link, nothing sent', () => {
  it('no number lets the owner pick the chat; a 10-digit number gets 91; the text is encoded', () => {
    expect(waLink('a & b')).toBe('https://wa.me/?text=a%20%26%20b');
    expect(waLink('hi', '98765 43210')).toBe('https://wa.me/919876543210?text=hi');
    expect(waLink('hi', '+44 7700 900123')).toBe('https://wa.me/447700900123?text=hi');
  });

  it('the sheet opens WhatsApp with a link and never calls the API to send', () => {
    const src = readFileSync(path.join(import.meta.dirname, 'BuyShareSheet.tsx'), 'utf8');
    expect(src).toMatch(/href=\{waLink\(text\)\}/);
    expect(src).not.toMatch(/api\./);
  });
});
