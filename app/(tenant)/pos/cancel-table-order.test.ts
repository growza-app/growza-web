import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync(resolve(__dirname, 'TableBillSheet.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8'));

/** Owner, 2026-11-22 ("now build the cancel table option") — a table's whole order called off in one go. */
describe('Cancel the whole order, on a table’s bill', () => {
  it('is the owner’s or a manager’s, only while dishes are on the bill, and not while taking one off', () => {
    expect(sheet).toContain('{canManage && live.length > 0 && !moving && !paying ? (');
    expect(sheet).toContain("{editing ? null : (\n                  <button type=\"button\" className=\"tb-edit-link\" disabled={busy || takingOff !== null || cancelling !== null} onClick={() => setCancelling({ askCooked: false })}>");
  });

  it('cancels with the Pickup’s own call, asks "already cooked?" when the server does, and frees the table', () => {
    expect(sheet).toContain('await api.cancelPendingCounterSale(saleId, cancelling.askCooked ? cancelling.cooked : undefined);');
    expect(sheet).toContain("if (e instanceof ApiError && e.code === 'cooked_unknown') setCancelling({ askCooked: true });");
    expect(sheet).toContain("onDone(t('cancelledOk', { table: table.name }));");
    // Nothing is sent until the cooked question is answered.
    expect(sheet).toContain('disabled={busy || (cancelling.askCooked && cancelling.cooked === undefined)}');
  });

  it('tells the kitchen to stop: a cancel slip for the table', () => {
    expect(sheet).toContain("printer.autoKot(slips, { tokenNo: null, channel: 'counter', orderType: 'dine_in', tableName: `${table.name} · ${areaName}` });");
  });

  it('says what happens in plain words, English and Hindi', () => {
    for (const m of [en, hi]) for (const k of ['cancelWholeOrder', 'cancelWholeBody', 'cancelWholeConfirm', 'keepOrder', 'cancelledOk']) expect(m.posTables[k], k).toBeTruthy();
    expect(en.posTables.cancelWholeBody).toBe('{amount} not collected. {table} is free again, and the order is kept in Orders as Cancelled.');
  });
});
