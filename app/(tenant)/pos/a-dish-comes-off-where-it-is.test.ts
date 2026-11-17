import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-17 — "when clicked take off the screen is not proper": the reason box was drawn under the total with
 * its buttons below the phone's edge. It now opens inside the dish's own row, ready to type and scrolled into view, and
 * the rest of the sheet steps back until the dish is taken off or cancelled. Spec 16 checks it on a 344px phone.
 */
const sheet = readFileSync(resolve(__dirname, 'TableBillSheet.tsx'), 'utf8');
const css = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');

describe('taking a dish off a table bill', () => {
  it('asks why inside that dish’s row', () => {
    const row = sheet.slice(sheet.indexOf('<li key={l.id}'), sheet.indexOf('</li>'));
    expect(row).toContain('{takingOff?.lineId === l.id ? (');
    expect(row).toContain('className="tb-reason"');
    expect(css).toContain('.tb-line .tb-reason { flex: 1 1 100%; }');
    expect(css).toContain('.tb-line .tb-reason .dt-field { flex: none; }');
  });
  it('is ready to type and in view', () => {
    expect(sheet).toContain("reasonInputRef.current?.focus({ preventScroll: true });");
    expect(sheet).toContain("reasonRef.current?.scrollIntoView({ block: 'nearest' });");
  });
  it('the service charge and the sheet’s actions step back meanwhile', () => {
    expect(sheet).toContain('{takingOff ? null : charge ? (');
    expect(sheet).toContain('{takingOff ? null : moving ? (');
  });
});
