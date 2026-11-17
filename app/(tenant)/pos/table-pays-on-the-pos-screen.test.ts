import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-17 — "these options should be as we have without table option": a table's Take payment opens the
 * POS's own payment screen (the one a Pickup order is paid on) — ways to pay, split, discount, points, QR, the guest —
 * not three buttons on the table's sheet. Spec 16 pays a table through it end to end.
 */
const pos = readFileSync(resolve(__dirname, 'PosClient.tsx'), 'utf8');
const flow = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
const sheet = readFileSync(resolve(__dirname, 'TableBillSheet.tsx'), 'utf8');

describe('a table is paid on the POS payment screen', () => {
  it('the sheet hands Take payment up when it can', () => {
    expect(sheet).toContain('onClick={() => (onTakePayment ? onTakePayment() : setPaying(true))}');
    expect(flow).toContain('onPayTable({ saleId: billOf.table.openBill!.saleId, tableName: billOf.table.name });');
  });
  it('the POS reads the bill fresh and opens its payment screen under the table’s name, with no token number', () => {
    expect(pos).toContain("onPayTable={(bill) => void payTable(bill)}");
    expect(pos).toContain('.map((r) => ({ ...r, tableName: null }))');
    expect(pos).toContain('void settleAndCompleteToken({ ...tk, tokenNo: 0, offlineToken: null, tokenLabel: tableName });');
    expect(pos).toContain("{mode === 'queue' || payingTable !== null ? (");
  });
  it('Back and the receipt return to the tables, and the room reads again once paid', () => {
    expect(pos).toContain("nextLabel={payingTable !== null ? t('backToTablesDone') : t(qk('backToQueueDone'))}");
    expect(pos).toContain('if (settledReceipt && payingTable !== null) setReloadKey((k) => k + 1);');
    expect(flow).toContain('    // A table paid on the POS\'s payment screen: the room reads again, so its tile is free.\n    setMapKey((k) => k + 1);');
  });
});

describe('a waiter pays a table on the same screen (owner, 17 Nov)', () => {
  it('reads the bill itself, since a waiter reads no day list', () => {
    expect(pos).toContain('o = await api.order(saleId);');
    expect(pos).toContain('void settleAndCompleteToken(tableBillToken(o, tableName));');
  });
  it('names the guest by typing, with no discount, no points, no guest list and no bill print', () => {
    expect(pos).toContain('byNameOnly={waiter}');
    expect(pos).toContain("aria-label={tPay('guestNameOnly')}");
    expect(pos).toContain('{!anonymous && !byNameOnly ? (\n        <RedeemRow');
    expect(pos).toContain("if (isWalkInToken(tk) && tk.channel === 'counter' && !waiter) {");
    expect(pos).toContain('await api.assignClientToSale(payingToken.id, { name: guestName });');
    expect(pos).toContain('if (!waiter) printer.autoBill(tk.id);');
    expect(pos).toContain("bill={!waiter} />");
  });
});
