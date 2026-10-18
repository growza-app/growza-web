import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-19 — a return starts with the Return button and nothing else. A scan on the Sales screen is a sale:
 * it used to open the Return sheet, so a bottle returned and then scanned to sell again opened the old bill.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('a scan on the Sales screen sells', () => {
  const sales = read('SalesClient.tsx');

  it('hands the scanned code to the sell page', () => {
    expect(sales).toContain("useBarcodeScan(mayRecordPayment && !returnSheet.open && !openBooking");
    expect(sales).toContain('/products/sell?scan=${encodeURIComponent(code)}');
  });

  it('never opens the Return sheet from a scan', () => {
    // Every remaining way in is a click: the sheet is opened with no scanned code.
    expect(sales).not.toMatch(/scannedCode: code/);
    expect(sales).not.toContain("e.key === 'Enter' && mayRecordPayment");
  });

  it('keeps the Return button', () => {
    expect(sales).toContain("setReturnSheet({ open: true, bill: null, scannedCode: '' })");
  });
});

describe('the sell page takes the scanned code', () => {
  it('reads ?scan, bounded, and passes it down', () => {
    const page = read('../products/sell/page.tsx');
    expect(page).toContain('scan?: string');
    expect(page).toContain('params.scan.slice(0, 80)');
    expect(page).toContain("params.from === 'sales' ? '/sales'");
    expect(read('../products/sell/SellProductClient.tsx')).toContain('scanCode={scanCode}');
  });

  it('puts the code on the bill once the shelf has loaded, then clears the address', () => {
    const flow = read('../appointments/new/PayFlow.tsx');
    expect(flow).toMatch(/if \(!productsOnly \|\| !productsLoaded \|\| !scanCode \|\| scanTaken\.current\) return;/);
    expect(flow).toContain('onScan(scanCode);');
    expect(flow).toContain("router.replace(");
    expect(flow.indexOf('scanTaken')).toBeLessThan(flow.indexOf("  if (step === 'done' && sale) {"));
  });
});
