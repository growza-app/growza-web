import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const flow = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
const ret = readFileSync(resolve(__dirname, '../sales/ReturnProductSheet.tsx'), 'utf8');
const pos = readFileSync(resolve(__dirname, '../styles/99-pos.css'), 'utf8');
const tables = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8'));

/** Develop QA 2026-11-21, design review of GRW-745 — every finding, fixed (owner, 2026-11-22: "fix all"). */
describe('GRW-745 design review', () => {
  it('D2 — Swiggy / Zomato are a whole 44px target on a phone', () => {
    expect(pos).toMatch(/\.pos-shell \.pf:not\(\.pf-wide\) \.pf-from \.pf-chip \{\s*flex: 1 1 0;\s*justify-content: center;\s*min-height: 2\.75rem;/);
  });

  it('D3 · D10 — the bill’s head is a plain card, not the table map’s Food cooking amber or Bill printed blue', () => {
    expect(tables).toMatch(/\.pf-order-head,\s*\.pf-order-head\.is-delivery \{\s*border: 1px solid var\(--border\);\s*background: var\(--surface\);\s*\}/);
  });

  it('D5 — Return names a token the way the receipt does: "Token #03"', () => {
    expect(ret).toContain("t('tokenNo', { n: String(b.tokenNo).padStart(2, '0') })");
    expect(en.sales.returnSheet.tokenNo).toBe('Token #{n}');
    expect(hi.sales.returnSheet.tokenNo).toContain('#{n}');
  });

  it('D6 — a delivery’s head does not repeat "paid by the app": the bill already says "Paid on Swiggy. Nothing to collect here."', () => {
    expect(flow).toContain("{orderTab === 'delivery' && !token ? null : (");
    expect(flow).not.toContain("orderTab === 'delivery' ? t('type.subDelivery')");
  });

  it('D7 — the lock says what to do, in plain words', () => {
    expect(en.payFlow.type.locked).toBe('Locked — the bill has dishes. Remove them to change it.');
    expect(hi.payFlow.type.locked).toContain('डिश हटाएँ');
  });

  it('D8 — Return’s Dine-in place is plain text, not the chosen green', () => {
    expect(tables).toMatch(/\.sls-ret-bill-place\.is-table \{\s*color: var\(--text\);/);
  });

  it('D9 — one chosen green: Home’s type chips use the till’s, not --forest', () => {
    expect(tables).toMatch(/\.hm-type-chip\.is-on \{\s*border-color: var\(--accent-deep\);\s*background: var\(--accent-deep\);/);
  });
});
