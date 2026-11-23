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
  it('is in view', () => {
    expect(sheet).toContain("reasonRef.current?.scrollIntoView({ block: 'nearest' });");
  });
  it('the sheet keeps its height: the rest stays, greyed out, and Take off and Cancel take Take payment\'s place', () => {
    expect(sheet).toContain('disabled={busy || takingOff !== null} onClick={onAddDishes}');
    expect(sheet).toMatch(/<button\s+type="submit"\s+form="tb-reason-form"\s+className="btn btn-danger"/);
    expect(sheet).toContain("{t('takeOffNamed', { name: takingOff.name })}");
    expect(sheet).toContain('id="tb-reason-form"');
    // Owner, 2026-11-22 — Take off is a solid red button; waiting for a reason it is plainly not ready, not a faded red.
    expect(css).toContain('.tb-foot-pair .btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }');
    expect(css).toContain('.tb-foot-pair .btn-danger:disabled { background: var(--surface); color: var(--muted); box-shadow: inset 0 0 0 1px var(--border); opacity: 1; }');
  });
  it('asks a short question under the dish, answered with one tap; words only for "Something else"', () => {
    expect(sheet).toContain("<legend className=\"field-hint\">{t('whyOffShort')}</legend>");
    expect(sheet).toContain("const OFF_REASONS = ['changed_mind', 'wrong_dish', 'too_late', 'not_good', 'other'] as const;");
    expect(sheet).toContain("{takingOff.pick === 'other' ? (");
    expect(sheet).toContain("aria-label={t('whyOff', { name: takingOff.name })}");
    // The keyboard comes up only for "Something else".
    expect(sheet).toContain('if (typingReason) reasonInputRef.current?.focus({ preventScroll: true });');
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
    expect(sheet).toContain("seatedMin === null ? null : seatedOnly ? t('seatedFor', { min: seatedMin }) : t('seated', { min: seatedMin }),");
    expect(sheet).toContain("oneTaker ? t('takenBy', { name: oneTaker }) : null,");
    // "by Ravi" under each dish only when more than one person took them.
    expect(sheet).toContain('{l.addedBy && !l.cancelReason && !oneTaker ? <span');
  });
  it('shows the count in its own column', () => {
    expect(sheet).toContain('<span className="tb-line-qty">{l.qty}×</span>');
  });
  it('keeps Take off behind "Take off a dish", for the owner and a manager only', () => {
    expect(sheet).toContain('const [editing, setEditing] = useState(false);');
    expect(sheet).toContain("{editing ? t('doneTakingOff') : t('takeOffDish')}");
    expect(sheet).toContain('{canManage && live.length > 0 && !moving && !paying ? (');
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

describe('the table bill reads small (owner, 17 Nov)', () => {
  it('dishes at 15px, buttons at 14px, the reason box at 16px', () => {
    expect(css).toContain('.tb-lines, .tb-sc { font-size: 0.9375rem; }');
    expect(css).toContain('.tb-sheet .btn, .tb-edit-link { font-size: 0.875rem; }');
    expect(css).toContain('.tb-sheet .tb-reason input { font-size: 1rem; }');
  });
});

describe('taking a dish off never drops the sheet (suite, 17 Nov: a short bill fell 61px)', () => {
  it('keeps each dish on one line and the link in place, greyed out', () => {
    expect(sheet).toContain("<ul className={`tb-lines${editing ? ' is-editing' : ''}`}>");
    // Owner, 2026-11-22 — one line per dish in edit mode: a red minus on its left, not a Take off button on a second line.
    expect(sheet).toContain('className="tb-off-minus"');
    expect(sheet).not.toContain('tb-off-btn');
    expect(sheet).toContain('className="tb-edit-link" aria-pressed={editing} disabled={busy || takingOff !== null || cancelling !== null}');
  });
});
