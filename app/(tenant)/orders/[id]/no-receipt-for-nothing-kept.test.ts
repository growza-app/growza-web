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
    // The row holding both controls is drawn only while something was kept.
    expect(order).toContain('{somethingKept && (isPaidCounter || (returnable && canReturn)) ? (');
    expect(order).toContain('{isPaidCounter ? <DocumentAction visitKey={order.id} primary /> : null}');
    expect(order.match(/<DocumentAction /g)).toHaveLength(1);
  });

  /** QA 2026-11-14 — nor "Return items" once every unit has come back: the sheet would open on nothing to give back. */
  it('offers Return items only inside that same row', () => {
    const row = order.slice(order.indexOf('{somethingKept && (isPaidCounter'), order.indexOf("{t('detail.returnItems')}"));
    expect(row).toContain('{returnable && canReturn ? (');
    expect(order.match(/t\('detail\.returnItems'\)/g)).toHaveLength(1);
  });
});
