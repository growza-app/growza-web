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
    expect(order).toContain('{isPaidCounter && somethingKept ? <DocumentAction visitKey={order.id} primary /> : null}');
    expect(order.match(/<DocumentAction /g)).toHaveLength(1);
  });
});
