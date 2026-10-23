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
    // `counted` — a kitchen has no shelf, so a scan there is never refused for stock (only a full bill, or an unknown code).
    expect(flow).toContain('planScans(codes, products, productCountOf, lines.length, MAX_LINES, counted)');
  });
});

describe('the Return sheet listens for a scan itself', () => {
  const sheet = read('ReturnProductSheet.tsx');

  it('uses the shared listener from the first moment, inside its own dialog', () => {
    expect(sheet).toContain('useBarcodeScan(step === 1, (code) => void takeCode(code), { insideDialog: true });');
    expect(sheet).not.toContain("addEventListener('keydown'");
  });

  it('treats a scan and a typed code the same way', () => {
    expect(sheet).toContain('const takeCode = (raw: string): boolean => {');
    expect(sheet).toContain('if (takeCode(code)) setQuery(\'\');');
  });
});

describe('the product sheet on a narrow phone', () => {
  it('lets the sort and stock chip wrap under the search box instead of sitting on it', () => {
    const css = read('../styles/73-pay-flow.css');
    expect(css).toMatch(/\.pf-menu-search-row \{[^}]*flex-wrap: wrap;/);
    expect(css).toMatch(/\.pf-menu-search-row \.pf-client-box \{[^}]*flex: 1 1 10rem;/);
    expect(css).toMatch(/\.pf-menu-search-row \.pf-client-box input \{[^}]*min-width: 0;/);
  });

  it('says "No product by that name" for products, not "No service"', () => {
    expect(read('../components/ServiceSheet.tsx')).toContain("t(counted ? 'desk.noProductMatch' : 'desk.noDishMatch')");
    // Jira GRW-643 — and "No dish by that name" to a kitchen, which the wide till used not to say either.
    expect(read('../appointments/new/DeskServiceGrid.tsx')).toContain("t(counted ? 'desk.noProductMatch' : 'desk.noDishMatch')");
  });
});
