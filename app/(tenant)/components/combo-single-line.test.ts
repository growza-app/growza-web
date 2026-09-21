import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import { splitComboRupees, type PickedItem } from './NewVisitSheet';

/**
 * Jira GRW-291 — a combo is one line: what its services list for, what it
 * saves, and what it costs — not its services split apart with the discount
 * invisible between the rows.
 *
 * NewVisitSheet is a client component with no DOM in this test environment
 * (the same reason walk-in-opens-now.test.ts and record-payment-till.test.ts
 * read source), so the wiring is read from source and the money math is
 * tested as the pure function it already was for GRW-290.
 */
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');

const line = (priceMinor: string | null): PickedItem => ({ serviceId: 's', name: 'x', durationMin: 30, priceMinor });

describe('the combo row replaces the per-service rows', () => {
  it('renders one row for the whole combo, not one per service', () => {
    expect(sheet).toMatch(/comboActive \? \(/);
    expect(sheet).toMatch(/className="wi-picked-row wi-picked-combo"/);
  });

  it('shows what it would have cost, what it saves, then what it costs', () => {
    expect(sheet).toMatch(/wi-combo-list">\{formatMoney\(String\(comboListMinor\)\)\}/);
    expect(sheet).toMatch(/wi-combo-save">\{nv\.comboSaves\(formatMoney\(String\(comboSavingMinor\)\)\)\}/);
  });

  it('one remove button clears the whole combo, not one service at a time', () => {
    expect(sheet).toMatch(/onClick=\{removeCombo\}/);
  });

  it('Record payment: one amount field for the combo, prefilled from its price', () => {
    expect(sheet).toMatch(/value=\{comboAmountText\}/);
    expect(sheet).toMatch(/onChange=\{\(e\) => setComboAmount/);
    expect(sheet).toMatch(/setComboAmountText\(offer\.comboPriceMinor \? String\(Number\(offer\.comboPriceMinor\) \/ 100\) : ''\);/);
  });

  it('a combo alone has no separate total row — the combo row already says the price', () => {
    expect(sheet).toMatch(/\{comboActive && extras\.length > 0 && \(/);
  });

  it('Jira GRW-292 — something added beside a combo is a new row, not a dissolved combo', () => {
    // The old behaviour this replaces: adding a service cleared offerId,
    // silently dropping the combo's discount.
    expect(sheet).not.toMatch(/setServiceTerm\(''\);\s*\/\/ Adding a loose service means this is no longer/);
    expect(sheet).toMatch(/if \(comboActive\) \{\s*setExtras\(\(prev\) => \[\.\.\.prev, item\]\);/);
  });

  it('removing the combo keeps whatever was added beside it, as the plain list', () => {
    expect(sheet).toMatch(/const removeCombo = \(\) => \{\s*setPicked\(extras\);\s*setExtras\(\[\]\);/);
  });
});

describe('what the combo saves', () => {
  it('list price minus combo price, never negative', () => {
    const list = 100000 + 50000; // ₹1,000 + ₹500
    const combo = 120000; // ₹1,200
    expect(list - combo).toBe(30000); // ₹300 saved
  });

  it('is worded the same way the till already says it', () => {
    expect(en.newVisit.comboSaves.replace('{amount}', '₹300')).toBe('Saves ₹300');
  });
});

describe('typing a new combo total still splits per leg for checkout', () => {
  it('the per-line amounts checkout reads still sum to what was typed', () => {
    const shares = splitComboRupees([line('100000'), line('50000')], '90000');
    expect(shares.reduce((sum, s) => sum + Number(s), 0)).toBe(900);
  });

  it('an unusable total blanks every line, so Mark done stays disabled by the existing check', () => {
    expect(sheet).toMatch(/setPicked\(\(prev\) => prev\.map\(\(item\) => \(\{ \.\.\.item, paidRupees: '' \}\)\)\);/);
  });
});
