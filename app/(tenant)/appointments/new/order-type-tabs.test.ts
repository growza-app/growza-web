import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';

/**
 * Jira GRW-720 — Dine-in · Takeaway · Delivery at the top of the till, for a branch that seats its guests.
 * Read from the source, the way the till's other rules are pinned: what decides the tabs, and what is sent.
 */
const flow = readFileSync(join(__dirname, 'PayFlow.tsx'), 'utf8');

describe('who gets the tabs (AC-02, AC-03 · BR-01)', () => {
  it('only a till that sells things, at a branch whose owner switched Table orders on', () => {
    expect(flow).toContain('const tablesHere = productsOnly && Boolean(session?.branches?.find((b) => b.id === location)?.tableOrders);');
    // Elsewhere the till draws the row it always had. GRW-745: the bill panel names the order (the table's line, or the
    // takeaway / delivery head); the switch itself sits at the top of the till, never in the bill.
    expect(flow).toContain('{tablesHere ? (atTable ? tableStrip : orderHead) : fromRow}');
  });

  it('Delivery only where the business has a delivery app — absent, not greyed out', () => {
    expect(flow).toContain("const typeTabs: Array<'dine_in' | 'takeaway' | 'delivery'> = ['dine_in', 'takeaway', ...(apps.length > 0 ? (['delivery'] as const) : [])];");
  });
});

describe('what is chosen and sent (AC-01 · BR-04)', () => {
  it('a fresh till opens on Dine-in, unless the address names a type (GRW-745 FR-02)', () => {
    expect(flow).toContain("useState<'dine_in' | 'takeaway' | 'delivery'>(() => orderTypeFromUrl() ?? 'dine_in')");
  });

  it('a counter order names its type; an app order names none (it is a delivery by where it came from)', () => {
    expect(flow).toContain("? { orderType: orderTab === 'dine_in' ? ('dine_in' as const) : ('takeaway' as const) }");
    expect(flow).toContain('tablesHere && !fromApp');
    // Jira GRW-721 — an order for a table names the table instead: the server makes it dine-in.
    expect(flow).toContain('? { tableId: atTable.id, ...(atTable.billId ? { tableBillId: atTable.billId } : {}), ...(atTable.seated ? { tableSeated: true } : {}), ...(guests ? { guests } : {}) }');
  });

  it('the kitchen slip is told the same type the server stored', () => {
    expect(flow).toContain("printer.autoKot(result.kot, { tokenNo, offlineToken, channel, orderType, ...(atTable ? { tableName: atTable.label } : {}) });");
  });

  it('the chosen tab is marked by more than colour', () => {
    expect(flow).toContain('aria-pressed={orderTab === key}');
  });
});

describe('words', () => {
  it('English and Hindi carry every tab, in plain words', () => {
    for (const key of ['label', 'dine_in', 'takeaway', 'delivery'] as const) {
      expect(en.payFlow.type[key]).toBeTruthy();
      expect(hi.payFlow.type[key]).toBeTruthy();
    }
    expect(Object.values(en.payFlow.type).join(' ')).not.toMatch(/order_type|KOT/);
  });
});
