import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-19 — a return starts with the Return button and nothing else. A scan on the Sales screen is a sale.
 * The behaviour itself is tested where it lives (`scan-queue`, `scan-plan`, `barcode-scan`); these pins are the wiring
 * that has no component test: where each piece is hooked in, and that the old way in stays shut.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('a scan on the Sales screen sells', () => {
  const sales = read('SalesClient.tsx');

  it('queues a known code and opens the sell page once', () => {
    expect(sales).toContain('queueScan(code)');
    expect(sales).toContain("router.push('/products/sell?from=sales')");
    expect(sales).toContain('if (leaving.current) return;');
    expect(sales).toContain('window.setTimeout(sellPage, SCAN_RUN_END_MS)');
  });

  it('says a code that is not on the shelf instead of leaving the screen', () => {
    expect(sales).toContain('setScanNote(code);');
    expect(sales).toContain("t('scanUnknown', { code: scanNote })");
  });

  it('offers to search by name when the code is not on the shelf', () => {
    expect(sales).toContain("t('scanSearch')");
    expect(sales).toContain('searchByName(scanNote)');
  });

  it('listens only where the sell page can be reached', () => {
    expect(sales).toContain('session?.live !== false');
    expect(sales).toContain('useBarcodeScan(sellReachable && !returnSheet.open && !openBooking');
  });

  it('never opens the Return sheet from a scan, and carries no scanned code for it', () => {
    expect(sales).not.toContain('scannedCode');
    expect(sales).not.toContain("e.key === 'Enter' && mayRecordPayment");
    expect(read('ReturnProductSheet.tsx')).not.toContain('initialScannedCode');
  });

  it('keeps the Return button', () => {
    expect(sales).toContain('setReturnSheet({ open: true, bill: null })');
  });
});

describe('the sell page takes the queued scans', () => {
  const flow = read('../appointments/new/PayFlow.tsx');

  it('takes them once, after the shelf has loaded, above the early returns', () => {
    expect(flow).toContain('const waiting = takeScans();');
    expect(flow).toContain('if (!productsOnly || !productsLoaded || scansTaken.current) return;');
    expect(flow.indexOf('scansTaken')).toBeLessThan(flow.indexOf("  if (step === 'done' && sale) {"));
  });

  it('listens from the first moment and queues a scan that arrives while the shelf loads', () => {
    expect(flow).toContain("useBarcodeScan(productsOnly && step === 'what'");
    expect(flow).toContain('else queueScan(code);');
  });

  it('puts a code that matched nothing in the search box, desktop and phone', () => {
    expect(flow).toContain("setSearchSeed((prev) => ({ text: problem.code, n: (prev?.n ?? 0) + 1 }));");
    expect(flow).toContain('if (!wide) setMenuOpen(true);');
    expect(flow).toContain('searchSeed={searchSeed}');
    expect(flow).toContain("initialTerm={searchSeed?.text ?? ''}");
    expect(read('../appointments/new/DeskServiceGrid.tsx')).toContain('setTerm(searchSeed.text);');
    expect(read('../components/ServiceSheet.tsx')).toContain('useState(initialTerm)');
  });

  it('does not call each bottle unknown when the shelf failed to load', () => {
    expect(flow).toContain('if (productsFailed) setScanNote(t(\'desk.scanShelfFailed\'));');
    expect(flow).toContain('setProductsFailed(true);');
  });

  it('works out a whole run before applying any of it', () => {
    expect(flow).toContain('planScans(codes, products, productCountOf, lines.length, MAX_LINES)');
  });
});
