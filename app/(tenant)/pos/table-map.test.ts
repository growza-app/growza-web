import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { minutesSeated, stateOf, TABLE_REFRESH_MS } from './TableMap';
import { buildDailyTokens } from './pos-helpers';
import type { Appointment, DiningTable } from '../lib/api';

/** Jira GRW-721 — the room on the till, and a table's bill. */
const map = readFileSync(join(__dirname, 'TableMap.tsx'), 'utf8');
const sheet = readFileSync(join(__dirname, 'TableBillSheet.tsx'), 'utf8');
const flow = readFileSync(join(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');

const table = (openBill: DiningTable['openBill']): DiningTable => ({ id: 't', name: 'T3', seats: 4, openBill });
const bill = (billPrinted: boolean) => ({ saleId: 's', tokenNo: null, seatedAt: '2026-11-16T10:00:00Z', totalMinor: 56_000, guests: 4, billPrinted });

describe('a tile says its state in words, not colour alone', () => {
  it('Free, Ordering, Bill printed', () => {
    expect(stateOf(table(null))).toBe('free');
    expect(stateOf(table(bill(false)))).toBe('ordering');
    expect(stateOf(table(bill(true)))).toBe('bill');
    expect(map).toContain("<span className=\"tm-state\">{t(`state.${state}`)}</span>");
    for (const s of ['free', 'ordering', 'bill'] as const) {
      expect(en.posTables.state[s]).toBeTruthy();
      expect(hi.posTables.state[s]).toBeTruthy();
    }
  });

  it('minutes seated count from when the table was opened', () => {
    expect(minutesSeated('2026-11-16T10:00:00Z', Date.parse('2026-11-16T10:41:00Z'))).toBe(41);
    expect(minutesSeated('2026-11-16T10:00:00Z', Date.parse('2026-11-16T09:59:00Z'))).toBe(0);
  });
});

describe('live and resilient', () => {
  it('reads the room again every 5 s; a failed refresh keeps the last map', () => {
    expect(TABLE_REFRESH_MS).toBe(5_000);
    expect(map).toContain("{areas ? t('staleMap') : t('loadFailed')}");
  });

  it('an empty room offers set-up only to the owner and a manager', () => {
    expect(map).toMatch(/canSetUp \? \(/);
    expect(flow).toContain("canSetUp={role === 'owner' || role === 'manager'}");
  });
});

describe('a table’s bill on the till', () => {
  it('lives on the map, never also as a token on the Queue', () => {
    const rows = [
      { id: 'a', status: 'completed', startAt: '2026-11-16T10:00:00Z', products: [{ name: 'Dal', qty: 1, paidMinor: '100' }], tableName: 'T3 · AC Hall', channel: 'counter' },
      { id: 'b', status: 'completed', startAt: '2026-11-16T10:01:00Z', products: [{ name: 'Tea', qty: 1, paidMinor: '30' }], channel: 'counter' },
    ] as unknown as Appointment[];
    expect(buildDailyTokens(rows, null)).toHaveLength(1);
  });

  it('only the owner and a manager may take a dish off; it asks why (and, Jira GRW-737, whether it was cooked when the server asks)', () => {
    expect(flow).toContain("canManage={role === 'owner' || role === 'manager'}");
    expect(sheet).toContain('{editing && canManage && !l.cancelReason && !moving ? (');
    expect(sheet).toContain("disabled={busy || takingOff.reason.trim() === '' || (takingOff.askCooked === true && takingOff.cooked === undefined)}");
  });

  it('payment asks who paid first, by the owner’s rule of 4 Nov 2026', () => {
    expect(sheet).toContain('await api.assignClientToSale(saleId, { name });');
  });

  it('a table with nothing left closes without a bill', () => {
    expect(sheet).toContain('api.cancelPendingCounterSale(saleId)');
  });

  it('the till sends a table’s order with the table, and says “Send to kitchen”', () => {
    expect(flow).toContain('? { tableId: atTable.id, ...(atTable.billId ? { tableBillId: atTable.billId } : {}), ...(guests ? { guests } : {}) }');
    expect(flow).toContain("atTable ? tTables('sendToKitchen') : t(qk('desk.keepPendingInQueue'))");
  });

  it('plain words: no KOT on the till', () => {
    expect(JSON.stringify(en.posTables)).not.toMatch(/KOT/);
  });
});

describe('Jira GRW-722 — move a party, join two tables', () => {
  it('Move table lists the other tables: a free one says Move here, a busy one says Join', () => {
    expect(sheet).toContain('const others = area.tables.filter((x) => x.id !== table.id);');
    expect(sheet).toContain("{x.openBill ? t('join') : t('moveHere')}");
    expect(sheet).toContain('to.openBill ? api.joinTable(table.id, to.id) : api.moveTable(table.id, to.id)');
  });

  it('the till hands the sheet its branch, so the picker reads that room', () => {
    expect(flow).toContain('location={location}\n            canManage=');
  });

  it('every new word is in English and Hindi, and says nothing about the kitchen slip by its trade name', () => {
    for (const k of ['moveTable', 'moveTitle', 'moveHint', 'moveHere', 'join', 'moveTo', 'joinTo', 'movedOk', 'joinedOk'] as const) {
      expect(en.posTables[k]).toBeTruthy();
      expect(hi.posTables[k]).toBeTruthy();
    }
    expect(en.posTables.moveHint).toMatch(/Nothing goes to the kitchen again/);
  });
});

const ordersList = readFileSync(join(__dirname, '../orders/OrdersClient.tsx'), 'utf8');
const discounts = readFileSync(join(__dirname, '../reports/money/DiscountReport.tsx'), 'utf8');

describe('QA 2026-11-16 — the dine-in run’s fixes on the till', () => {
  it('#9 — on the phone a kitchen’s order says Dine-in and its table, not just Counter', () => {
    expect(ordersList).toContain("? [typeWord(r.orderType), r.tableName].filter(Boolean).join(' · ')\n                                : channelWord(r.channel)");
  });

  it('#10 — Discounts & free shows dishes taken off after cooking, in both languages', () => {
    expect(discounts).toContain("d('takenOffTitle', { value: f.money(r.takenOff.totalMinor) })");
  });

  it('#5 — the banner says what happened: only an order sent to the kitchen says "Sent to kitchen"', () => {
    expect(flow).toContain("setTableSent(tTables('sent', { table: atTable.label }));");
    expect(flow).not.toContain("tTables('sent', { table: tableSent })");
    expect(en.posTables.paidOk).not.toMatch(/kitchen/i);
  });

  it('#7 — a picked table waits for one confirm; a join says it cannot be undone', () => {
    expect(sheet).toContain('onClick={() => setPicked(x)}');
    expect(sheet).toContain('onClick={() => void moveTo(picked)}');
    expect(en.posTables.confirmJoinLine).toMatch(/cannot be undone/);
    for (const k of ['confirmMoveTitle', 'confirmMoveLine', 'confirmJoinTitle', 'confirmJoinLine', 'back', 'billLoading'] as const) {
      expect(en.posTables[k]).toBeTruthy();
      expect(hi.posTables[k]).toBeTruthy();
    }
  });

  it('#11 — the bill sheet says it is loading the bill, not the tables', () => {
    expect(sheet).toContain("{order === null && !error ? <p className=\"field-hint\">{t('billLoading')}</p> : null}");
  });

  it('a round from the bill sheet names the bill, so a bill that moved meanwhile is refused', () => {
    expect(flow).toContain('...(billOf.table.openBill ? { billId: billOf.table.openBill.saleId } : {})');
  });
});

const tablesForm = readFileSync(join(__dirname, '../settings/tables/TablesForm.tsx'), 'utf8');

describe('Jira GRW-724 — a service charge the guest can say no to', () => {
  it('BR-01 — never on a bill by itself: an Add button, shown only where the branch offers it, and never to a waiter', () => {
    expect(sheet).toContain(') : offerBp !== null && !waiter && live.length > 0 ? (');
    expect(sheet).toContain("api.setBillServiceCharge(saleId, true)");
  });

  it('BR-02 — its own named line, removable by anyone at the till (the guest’s right)', () => {
    expect(sheet).toContain('{charge ? (');
    expect(sheet).toContain("api.setBillServiceCharge(saleId, false)");
    // Not a dish: it is never offered "Take off", and it is never a dish to bring back.
    expect(sheet).toContain("const dishes = (order?.lines ?? []).filter((l) => l.kind !== 'service_charge');");
  });

  it('the owner offers it per branch, explained once in plain words, in both languages', () => {
    expect(tablesForm).toContain('<ServiceChargeOffer branch={branch}');
    for (const k of ['serviceCharge', 'serviceChargeHint', 'serviceChargeRate', 'serviceChargeSave', 'serviceChargeRange'] as const) {
      expect(en.settingsTables[k]).toBeTruthy();
      expect(hi.settingsTables[k]).toBeTruthy();
    }
    expect(en.settingsTables.serviceChargeHint).toMatch(/Never added by itself/);
    expect(en.posTables.serviceChargeAdd).toMatch(/guest can say no/);
    expect(JSON.stringify(en.posTables) + JSON.stringify(en.settingsTables)).not.toMatch(/\bSC\b/);
  });
});
