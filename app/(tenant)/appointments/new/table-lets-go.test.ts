import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-17 — "I placed a takeaway order and it's showing as Dine In". A table chosen on the till stayed chosen
 * after a visit to Queue (the type tabs hidden behind it), and the next order was put on that table — which the server
 * records as dine-in. Source-reading: there is no DOM in this suite; the restaurant browser suite drives the till.
 */
const flow = readFileSync(resolve(__dirname, 'PayFlow.tsx'), 'utf8');

describe('the till lets go of a table', () => {
  it('when Sell is left for Queue or Return', () => {
    expect(flow).toMatch(/useEffect\(\(\) => \{\s*if \(!inactive\) return;\s*setAtTable\(null\);\s*setGuests\(null\);\s*\}, \[inactive\]\);/);
  });
  it('when the bill is finished and the next guest starts', () => {
    expect(flow).toMatch(/const nextCustomer = \(\) => \{\s*setLines\(\[\]\);[\s\S]{0,200}setAtTable\(null\);\s*setGuests\(null\);/);
  });
  it('and while a table is chosen, Dine-in is said: by the POS bar above it, or by the strip where there is no bar', () => {
    // GRW-745: where there is no bar (a waiter's till, full screen) the strip says "Dine-in" over the table's name.
    expect(flow).toContain("<span className=\"pf-table-type\">{t('type.dine_in')}</span>\n            <span className=\"pf-table-label\">{atTable.label}</span>");
    // Owner, 2026-11-22 — under the POS bar (whose Dine-in is on) the table itself is the way back, named in full.
    expect(flow).toContain('aria-label={`${tTables(\'backToTables\')}: ${atTable.label}`} onClick={() => setAtTable(null)}>');
  });
});
