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

describe('Take payment on a table bill', () => {
  it('has a full row of its own and never clips its words', () => {
    expect(sheet).toContain('className="btn tb-take-pay"');
    expect(css).toContain('.tb-foot .tb-take-pay { width: 100%; min-height: 48px; white-space: normal; overflow-wrap: anywhere; }');
    expect(css).toContain('.tb-sheet .tb-actions .btn { white-space: normal;');
  });
});

describe('the table bill, after the 17 Nov design review', () => {
  it('names the table as its title, with room, minutes seated and one taker under it', () => {
    expect(sheet).toContain('<span className="pf-keypad-title tb-title-name">{table.name}</span>');
    expect(sheet).toContain("[areaName, seatedMin === null ? null : t('seated', { min: seatedMin }), oneTaker ? t('takenBy', { name: oneTaker }) : null]");
    // "by Ravi" under each dish only when more than one person took them.
    expect(sheet).toContain('{l.addedBy && !l.cancelReason && !oneTaker ? <span');
  });
  it('shows the count in its own column', () => {
    expect(sheet).toContain('<span className="tb-line-qty">{l.qty}×</span>');
  });
  it('keeps Take off behind "Take off a dish", for the owner and a manager only', () => {
    expect(sheet).toContain('const [editing, setEditing] = useState(false);');
    expect(sheet).toContain("{editing ? t('doneTakingOff') : t('takeOffDish')}");
    expect(sheet).toContain('{canManage && live.length > 0 && !moving && !paying && !takingOff ? (');
  });
  it('pins Total and Take payment to the foot of the sheet', () => {
    const foot = sheet.slice(sheet.indexOf('<div className="tb-foot">'));
    expect(foot).toContain("t('total')");
    expect(foot).toContain('className="btn tb-take-pay"');
    expect(css).toMatch(/\.tb-foot \{\n  position: sticky;/);
  });
  it('offers the service charge as a row with a short Add', () => {
    expect(sheet).toContain("{t('serviceChargeRow', { rate: offerBp / 100 })}");
    expect(sheet).toContain("aria-label={t('serviceChargeAdd', { rate: offerBp / 100 })}");
  });
});
