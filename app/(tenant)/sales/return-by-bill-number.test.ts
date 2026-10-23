import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findBillByRef } from './sales-helpers';

/**
 * QA of develop, 2026-10-23 — the Return box says "Search by bill number, customer, product or scan barcode".
 *
 * Typing bill 5B0628C5 and pressing Enter opened bill #0A9C2881 — the newest one, open beside the list only so the pane was
 * not empty — with its one line already ticked for a ₹450 refund, and threw the typed number away. Enter matched product
 * codes only, then fell through to "scan into the open bill".
 */
const bills = [
  { key: 'single:0a9c2881-1111-4000-8000-000000000001', name: 'newest' },
  { key: 'single:5b0628c5-83c4-41ad-a067-c73922b0e736', name: 'levis' },
  { key: '41cacb53-2222-4000-8000-000000000002', name: 'grouped' },
];

describe('a bill found by its number', () => {
  it('is found however the number is typed: with #, in lower case, or as the whole id', () => {
    expect(findBillByRef(bills, '5B0628C5')?.name).toBe('levis');
    expect(findBillByRef(bills, '#5b0628c5')?.name).toBe('levis');
    expect(findBillByRef(bills, ' 5b0628c5-83c4-41ad-a067-c73922b0e736 ')?.name).toBe('levis');
    expect(findBillByRef(bills, '41CACB53')?.name).toBe('grouped');
  });

  it('is never a short product code, an unknown number, or two bills at once', () => {
    expect(findBillByRef(bills, '5B06')).toBeNull();
    expect(findBillByRef(bills, '890100000001')).toBeNull();
    expect(findBillByRef(bills, 'DEADBEEF')).toBeNull();
    const twins = [...bills, { key: 'single:5b0628c5-9999-4000-8000-000000000003', name: 'twin' }];
    expect(findBillByRef(twins, '5B0628C5')).toBeNull();
  });
});

describe('the Return sheet', () => {
  const src = readFileSync(resolve(__dirname, 'ReturnProductSheet.tsx'), 'utf8');
  const takeCode = src.slice(src.indexOf('const takeCode'), src.indexOf('useBarcodeScan('));

  it('opens the bill whose number was typed before it would scan into the open one', () => {
    expect(takeCode.indexOf('findBillByRef(')).toBeGreaterThan(-1);
    expect(takeCode.indexOf('findBillByRef(')).toBeLessThan(takeCode.lastIndexOf('applyBarcodeToSelectedBill('));
  });

  it('scans into the open bill only when somebody chose it', () => {
    for (const m of takeCode.matchAll(/if \(selectedBill(?: &&[^)]*)?\)/g)) expect(m[0]).toContain('billPicked');
  });

  it('ticks nothing on a bill nobody chose', () => {
    expect(src).toContain('buildInitialQtyMap(initialBill)');
    expect(src).not.toContain('buildInitialQtyMap(defaultBill)');
  });
});
