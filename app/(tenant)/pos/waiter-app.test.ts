import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { canSee } from '../lib/nav-policy';
import { servesTablesOnly, type Areas } from '../lib/areas';
import { kotFromApi } from '../lib/print/from-api';

/** Jira GRW-723 — a waiter's app: the room, a table's bill, nothing of the counter's. */
const flow = readFileSync(join(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
const sheet = readFileSync(join(__dirname, 'TableBillSheet.tsx'), 'utf8');
const pos = readFileSync(join(__dirname, 'PosClient.tsx'), 'utf8');
const home = readFileSync(join(__dirname, '../page.tsx'), 'utf8');

const restaurant = (pages: Areas['pages']): Areas => ({ bookings: false, services: false, shop: true, stock: false, tables: true, pages });

describe('who is a waiter', () => {
  it('Tables granted and Bookings not at Change; the counter and the owner are not', () => {
    expect(servesTablesOnly({ tables: 'manage' })).toBe(true);
    expect(servesTablesOnly({ tables: 'manage', bookings: 'manage' })).toBe(false);
    expect(servesTablesOnly({ bookings: 'manage' })).toBe(false);
    expect(servesTablesOnly(null)).toBe(false);
  });
});

describe('BR-01 — a waiter is offered the room and nothing else', () => {
  const waiter = restaurant({ tables: 'manage' });
  it('the till, the bell and Help — no Orders, Reports, Settings, Clients or Home', () => {
    expect(canSee('/pos', 'receptionist', [], true, waiter)).toBe(true);
    expect(canSee('/notifications', 'receptionist', [], true, waiter)).toBe(true);
    for (const href of ['/orders', '/reports', '/reports/payments', '/settings', '/customers', '/stock', '/']) {
      expect(canSee(href, 'receptionist', [], true, waiter), href).toBe(false);
    }
  });

  it('Home sends a waiter to the room', () => {
    expect(home).toContain("if (servesTablesOnly(areasOf(me).pages)) redirect('/pos');");
  });
});

describe('AC-03 · BR-02 — what a waiter’s till does not draw', () => {
  it('no Sell/Queue/Return tabs and no type tabs: Dine-in only', () => {
    expect(pos).toContain('{waiter ? (');
    expect(flow).toContain('tablesHere && !token && !waiter ? (');
  });

  it('no guest lookup on the dish step: a waiter names the guest when they pay', () => {
    expect(flow).toContain('const who = waiter ? null : token ? (');
  });

  it('no Print bill; payment only once the counter has printed the bill', () => {
    expect(sheet).toContain('{waiter ? null : (');
    expect(sheet).toContain(') : waiter && !table.openBill?.billPrinted ? (');
  });

  it('AC-04 — Table orders off: told so, and nothing else', () => {
    expect(flow).toContain('if (waiter && session && !tablesHere) {');
    for (const k of ['waiterOff', 'waiterOffHint', 'waiterAskBill', 'takenBy'] as const) {
      expect(en.posTables[k]).toBeTruthy();
      expect(hi.posTables[k]).toBeTruthy();
    }
  });
});

describe('AC-01 — the slip says who sent it', () => {
  it('"T5 · AC Hall · Ravi"', () => {
    const kot = kotFromApi(
      { id: 'k', number: 4, kind: 'new', createdAt: '2026-11-16T10:00:00Z', items: [{ name: 'Veg Thali', qty: 2 }], takenBy: 'Ravi' },
      { tokenNo: null, channel: 'counter', orderType: 'dine_in', tableName: 'T5 · AC Hall' },
      () => '10:00',
      false,
      (_type, table) => `DINE-IN${table ? ` · ${table}` : ''}`,
    );
    expect(kot.destination).toBe('DINE-IN · T5 · AC Hall · Ravi');
  });

  it('Payments says who took the money, in both languages', () => {
    expect(en.moneyReports.payments.byPersonTitle).toBe('Taken by');
    expect(hi.moneyReports.payments.byPersonTitle).toBeTruthy();
  });
});
