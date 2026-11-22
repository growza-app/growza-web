import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTableOrder, orderKindOf } from './pos-helpers';
import { orderTypeOf } from '../lib/order-type-url';

const flow = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
const home = readFileSync(resolve(__dirname, '../components/home/ShopHome.tsx'), 'utf8');
const ret = readFileSync(resolve(__dirname, '../sales/ReturnProductSheet.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8'));

/** Jira GRW-745 — dine-in, takeaway and delivery are separate at the desk. */
describe('GRW-745 — what kind of order it is', () => {
  it('a table order is dine-in and never a pickup token; an app order is a delivery; the rest are takeaway', () => {
    expect(isTableOrder({ tableName: 'T4 · Main Hall' })).toBe(true);
    expect(isTableOrder({ tableName: null })).toBe(false);
    expect(orderKindOf({ tableName: 'T4 · Main Hall', orderType: 'dine_in', channel: 'counter' })).toBe('dine_in');
    expect(orderKindOf({ tableName: null, orderType: 'takeaway', channel: 'counter' })).toBe('takeaway');
    expect(orderKindOf({ tableName: null, orderType: null, channel: 'swiggy' })).toBe('delivery');
    expect(orderKindOf({ tableName: null, orderType: null, channel: 'counter' })).toBe('takeaway');
  });

  it('FR-02 — the address names the type; anything else is no type (the default holds)', () => {
    expect(orderTypeOf('dine-in')).toBe('dine_in');
    expect(orderTypeOf('takeaway')).toBe('takeaway');
    expect(orderTypeOf('delivery')).toBe('delivery');
    expect(orderTypeOf('xyz')).toBeNull();
    expect(orderTypeOf(null)).toBeNull();
  });
});

describe('GRW-745 — the till', () => {
  it('FR-01 — one switch, at the top of the till: never inside the bill panel', () => {
    expect(flow).toContain('{typeRow}\n        <div className="pf-wide-grid">');
    expect(flow).toContain('{typesHere ? (atTable ? tableStrip : orderHead) : fromRow}');
    expect(flow).not.toContain('atTable ? tableStrip : typeRow');
  });

  it('FR-04 · BR-01 — locked once the order has a table or a dish, and it says why', () => {
    expect(flow).toContain("const typeLock = atTable ? t('type.lockedTable', { table: atTable.label }) : lines.length > 0 ? t('type.locked') : null;");
    expect(flow).toContain("aria-describedby={typeLock ? 'pf-type-lock' : undefined}");
    expect(flow).toContain('if (typeLock) {');
  });

  it('FR-03 · FR-09 — the bill names a takeaway or a delivery, in English and Hindi', () => {
    for (const m of [en, hi]) for (const k of ['locked', 'lockedTable', 'headTakeaway', 'headToken', 'headDelivery', 'subTakeaway', 'subDelivery']) expect(m.payFlow.type[k], k).toBeTruthy();
  });
});

describe('GRW-745 — Home and Return', () => {
  it('FR-06 · BR-02 — Home’s queue leaves a table’s order out (the POS Pickup rule)', () => {
    expect(home).toContain('if (isTableOrder(o)) return false;');
  });

  it('FR-07 — Recent orders say where an order was eaten, and filter by it', () => {
    expect(home).toContain('${placeWord(o)} · ${formatDateTime(o.soldAt)}');
    expect(home).toContain("recentPool.filter((o) => orderKindOf(o) === recentType)");
    expect(home.match(/\{typeChips\}/g)?.length).toBe(3);
  });

  it('FR-08 — Return names a bill by its table or token and finds it by them', () => {
    expect(ret).toContain('if (b.tableName && b.tableName.toLowerCase().includes(q)) return true;');
    expect(ret).toContain("className={`sls-ret-bill-place ${b.tableName ? 'is-table' : 'is-token'}`}");
    for (const m of [en, hi]) for (const k of ['dineIn', 'takeaway']) expect(m.sales.returnSheet[k], k).toBeTruthy();
  });

  it('Delivery always has an app, the number sits in the bill, and the switch keeps its width (owner, "alignment issue")', () => {
    // ?type=delivery, a kept tab after a sale, or apps loading late: the first app is chosen, never "Delivery · Delivery".
    expect(flow).toContain("if (typesHere && orderTab === 'delivery' && !apps.includes(orderFrom) && firstApp) setOrderFrom(firstApp);");
    // A held bill brings its own type back with it.
    expect(flow).toContain("if (found.from && apps.includes(found.from)) setOrderTab('delivery');");
    // The order number is the bill's, so the top line holds only choices and stays one line.
    expect(flow).toContain("{orderTab === 'delivery' ? orderNo : null}");
    expect(flow).toContain('{withCounter ? orderNo : null}');
    const css = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');
    expect(css).toMatch(/\.pf-type-top \.pf-type-tabs \{\s*flex: 0 1 30rem;/);
  });

  it('QA 2026-11-21 — Delivery keeps its app row once the bill has a dish: the lock is the switch’s alone', () => {
    expect(flow).toContain("const appsRow = orderTab === 'delivery' && apps.length > 0 ? fromAppChips : null;");
    expect(flow).not.toMatch(/typeLock[^\n]*\? appsRow/);
    expect(flow).not.toContain('!typeLock ? fromAppChips');
  });

  it('QA 2026-11-21 — adding dishes to a table with an open bill starts from that bill’s guest count, and sends it', () => {
    expect(flow).toContain('setGuests(billOf.table.openBill?.guests ?? seatedHere?.guests ?? null);');
    expect(flow).toContain('...(guests ? { guests } : {})');
  });

  it('QA 2026-11-21 — a Home type chip with no orders names the type, never "Your first sale"', () => {
    expect(home).toContain("const recentEmpty = recentType === 'all' ? s.noOrdersBody : s.noTypeOrders[recentType];");
    // The laptop panel, the laptop table and the phone card (which showed nothing at all).
    expect(home.match(/<p className="hm-empty">\{recentEmpty\}<\/p>/g)).toHaveLength(3);
    const copy = readFileSync(resolve(__dirname, '../lib/home-copy.ts'), 'utf8');
    for (const k of ['dine_in', 'takeaway', 'delivery']) expect(copy).toMatch(new RegExp(`${k}: S\\('No [a-z-]+ orders recently\\.', '[^']+'\\)`));
  });
});
