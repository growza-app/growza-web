import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-14, F21 — a fully returned order's page asked for its receipt preview and was refused (404 "That bill was
 * not found": the bill is only what was kept), and "Make receipt" then vanished. Nothing kept, no question asked: the
 * receipt control is not drawn.
 */
const order = readFileSync(new URL('./OrderClient.tsx', import.meta.url), 'utf8');

describe('no receipt control for an order with nothing kept', () => {
  it('asks for the receipt only while something on the order was kept', () => {
    expect(order).toContain('const somethingKept = order.lines.some((l) => l.qty > l.returnedQty);');
    // Owner, 2026-11-16 — one block of the order's paper; every control in it asks the same question first.
    expect(order).toContain('const canPrintBill = isCounter && isPaidCounter && somethingKept;');
    expect(order).toContain('const showReceipt = isPaidCounter && somethingKept;');
    expect(order).toContain('{showReceipt && !canPrintBill ? <DocumentAction visitKey={order.id} primary compact /> : null}');
    expect(order).toContain('{canPrintBill ? <DocumentAction visitKey={order.id} sendOnly /> : null}');
    expect(order.match(/<DocumentAction /g)).toHaveLength(2);
  });

  /** QA 2026-11-14 — nor "Return items" once every unit has come back: the sheet would open on nothing to give back. */
  it('offers Return items only inside that same row', () => {
    expect(order).toContain('const showReturn = somethingKept && Boolean(returnable && canReturn);');
    expect(order).toContain('{showReturn ? (');
    expect(order.match(/t\('detail\.returnItems'\)/g)).toHaveLength(1);
  });
});
