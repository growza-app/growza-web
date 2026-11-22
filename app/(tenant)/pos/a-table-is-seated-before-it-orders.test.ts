import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { stateOf, STILL_SEATED_MIN, TABLE_STATES } from './TableMap';
import type { DiningTable } from '../lib/api';

/** Jira GRW-732 — a table marked Seated before its first order: the map, the strip's Seat guests, the sheet's Free again. */
const map = readFileSync(join(__dirname, 'TableMap.tsx'), 'utf8');
const sheet = readFileSync(join(__dirname, 'TableBillSheet.tsx'), 'utf8');
const flow = readFileSync(join(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
const api = readFileSync(join(__dirname, '../lib/api.ts'), 'utf8');
const css = readFileSync(join(__dirname, '../styles/99-dining-tables.css'), 'utf8');

const t3 = (over: Partial<DiningTable>): DiningTable => ({ id: 't3', name: 'T3', seats: 4, openBill: null, seated: null, ...over });
const bill = { saleId: 's', tokenNo: null, seatedAt: '2026-11-18T19:00:00Z', totalMinor: 56_000, guests: 2, billPrinted: false, foodCooking: true };

describe('AC-01 — Seated, then Food cooking', () => {
  it('a table with guests and no bill is Seated; a free one Free; an older API that sends no `seated` is Free', () => {
    expect(stateOf(t3({ seated: { at: '2026-11-18T19:00:00Z', guests: 2 } }))).toBe('seated');
    expect(stateOf(t3({}))).toBe('free');
    const { seated: _gone, ...older } = t3({});
    expect(stateOf(older as DiningTable)).toBe('free');
  });

  it('a bill, once open, is what the table is — Food cooking, Eating, Bill printed all win over Seated', () => {
    const at = { at: '2026-11-18T19:00:00Z', guests: 2 };
    expect(stateOf(t3({ seated: at, openBill: bill }))).toBe('cooking');
    expect(stateOf(t3({ seated: at, openBill: { ...bill, foodCooking: false } }))).toBe('eating');
    expect(stateOf(t3({ seated: at, openBill: { ...bill, billPrinted: true } }))).toBe('bill');
  });

  it('the legend names Seated between Free and Food cooking, in both languages, in its own colour', () => {
    expect(TABLE_STATES.indexOf('seated')).toBe(1);
    expect(en.posTables.state.seated).toBe('Seated');
    expect(hi.posTables.state.seated).toBeTruthy();
    expect(hi.posTables.state.seated).not.toBe(en.posTables.state.seated);
    expect(css).toContain('.tm-tile.is-seated, .tm-key.is-seated .tm-swatch { background: var(--purple-soft); border-color: var(--purple-deep); }');
  });

  it('the tile says "Seated · 3 min": the word, then the minutes since they sat', () => {
    expect(map).toContain("const seatedMin = !bill && table.seated ? minutesSeated(table.seated.at, now) : null;");
    expect(map).toContain("stale ? t('stillSeated', { min: seatedMin }) : t('seated', { min: seatedMin })");
  });

  it('a Seated table opens its sheet (not the dish grid), and Take order starts the order with its count', () => {
    expect(map).toContain("onClick={() => (state === 'free' ? onFree(table, area) : onBusy(table, area))}");
    expect(flow).toContain('...(seatedHere ? { seated: true } : {}),');
    expect(flow).toContain('setGuests(billOf.table.openBill?.guests ?? seatedHere?.guests ?? null);');
    // The order says it was for a Seated table, so the server can refuse one seated by somebody else meanwhile.
    expect(flow).toContain('...(atTable.seated ? { tableSeated: true } : {})');
    expect(sheet).toContain("{t('takeOrder')}");
  });

  it('Seat guests: on a Free table with nothing on the order, with the guest count the strip already asks', () => {
    expect(flow).toContain('{!atTable.billId && !atTable.seated && lines.length === 0 ? (');
    expect(flow).toContain('await api.seatTable(atTable.id, guests);');
    expect(api).toContain('seatTable: (tableId: string, guests: number | null) => post<{ areas: DiningArea[] }>(`/api/v1/tables/${encodeURIComponent(tableId)}/seat`, { guests }),');
  });
});

describe('AC-02 — two staff at once', () => {
  it('the one who lost is told what the server said ("T3 was just taken"), and the room is read again', () => {
    expect(flow).toContain("setTableSent(e instanceof ApiError ? e.message : tTables('actionFailed'));");
    expect(flow).toContain('setMapKey((k) => k + 1);');
  });
});

describe('AC-03 — guests leave', () => {
  it('Free again on a Seated table’s sheet, and the map says so', () => {
    expect(sheet).toContain("api.freeTable(table.id), 'done', t('freedOk', { table: table.name })");
    expect(api).toContain('freeTable: (tableId: string) => del<{ areas: DiningArea[] }>(`/api/v1/tables/${encodeURIComponent(tableId)}/seat`),');
  });

  it('a Seated sheet reads no bill and offers no payment, print or take-off', () => {
    expect(sheet).toContain('if (seatedOnly) return;');
    expect(sheet).toContain('{order === null && !error && !seatedOnly ?');
  });
});

describe('BR-02 — Still seated?', () => {
  it('after an hour with no order the tile steps back and asks; the sheet asks in full', () => {
    expect(STILL_SEATED_MIN).toBe(60);
    expect(map).toContain('const stale = seatedMin !== null && seatedMin >= STILL_SEATED_MIN;');
    expect(css).toContain('.tm-tile.is-seated.is-stale { background: var(--surface); border-style: dashed; }');
    expect(sheet).toContain("seatedMin !== null && seatedMin >= STILL_SEATED_MIN ? <p className=\"field-hint tb-still\">{t('stillSeatedAsk')}</p> : null");
  });
});

describe('BR-03 — Move table on a Seated table', () => {
  it('the sheet offers Move table, and only free tables take a Seated party; nobody moves onto a Seated table', () => {
    expect(sheet).toContain("const targetOf = (x: DiningTable): 'move' | 'join' | null => (x.openBill ? (seatedOnly ? null : 'join') : x.seated ? null : 'move');");
    expect(sheet).toContain('disabled={busy || takes === null}');
    expect(sheet).toContain("{seatedOnly ? t('moveHintSeated') : t('moveHint')}");
  });
});

describe('EN + HI', () => {
  it('every new word is in both languages, and plain', () => {
    for (const k of ['seatGuests', 'seatedOk', 'seatedFor', 'guestsN', 'stillSeated', 'stillSeatedAsk', 'takeOrder', 'freeAgain', 'freedOk', 'moveHintSeated'] as const) {
      expect(en.posTables[k], k).toBeTruthy();
      expect(hi.posTables[k], k).toBeTruthy();
      expect(hi.posTables[k], k).not.toBe(en.posTables[k]);
      expect(en.posTables[k]).not.toMatch(/KOT|occupied/i);
    }
  });
});
