import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copy } from '../lib/copy';

/**
 * Jira GRW-292 — adding a service beside a combo used to dissolve the whole
 * combo back to individual full-price rows, silently: `addService` cleared
 * `offerId`, and the server's `assertOfferPricesTheseServices` would have
 * refused the offer anyway once `serviceIds` no longer matched it exactly —
 * so the sheet had to give up the discount to keep working, and never said
 * so. Owner-reported bug, 2026-09-16.
 *
 * The fix: the combo's own `picked` never changes once chosen. Anything
 * added alongside it becomes an `extras` row instead — Record payment settles
 * both through one checkout call (`extraServices`, the same mechanism a
 * stylist already uses to sell something extra in the chair); Walk-in now and
 * For later have no such step, so there the primary button stays disabled
 * with an explanation instead of silently dropping the combo.
 *
 * Source-read, same reasoning as combo-single-line.test.ts.
 */
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');
const payFor = sheet.slice(sheet.indexOf('const payFor = async'), sheet.indexOf('const queueIt = async'));

describe('a combo survives a second service being added beside it', () => {
  it('addService routes into extras, not into picked, while a combo is active', () => {
    expect(sheet).toMatch(/if \(comboActive\) \{\s*setExtras\(\(prev\) => \[\.\.\.prev, item\]\);\s*\} else \{\s*setPicked\(\(prev\) => \[\.\.\.prev, item\]\);/);
  });

  it('no longer clears the combo on every added service', () => {
    expect(sheet).not.toMatch(/setOfferId\(null\);\s*setComboPriceMinor\(null\);\s*setComboTitle\(null\);\s*setComboAmountText\(''\);\s*\};\s*\n\s*const applyCombo/);
  });

  it('extras render as their own rows, with their own remove and amount handlers', () => {
    expect(sheet).toMatch(/\{extras\.map\(\(item, i\) => \(/);
    expect(sheet).toMatch(/onClick=\{\(\) => removeExtraAt\(i\)\}/);
    expect(sheet).toMatch(/onChange=\{\(e\) => setExtraAmountAt\(i, e\.target\.value\.replace/);
  });
});

describe('Record payment settles the combo and its extras in one checkout', () => {
  it('builds extraServices from the extras array', () => {
    expect(payFor).toMatch(/const extraServices = extras\.map\(\(item\) => \(\{/);
    expect(payFor).toMatch(/serviceId: item\.serviceId,/);
    expect(payFor).toMatch(/\.\.\.\(extraServices\.length > 0 \? \{ extraServices \} : \{\}\),/);
  });

  it('the paid total includes what was sold beside the combo', () => {
    expect(payFor).toMatch(/totalMinor: amounts\.reduce\(\(a, b\) => a \+ b, 0\) \+ extraServices\.reduce/);
  });
});

describe('Walk-in now / For later refuse to leave a combo half-booked', () => {
  it('the primary button and Add to waiting queue are blocked while an extra sits beside a combo', () => {
    expect(sheet).toMatch(/const comboBlocksSubmit = !forPayment && comboActive && extras\.length > 0;/);
    expect(sheet).toMatch(/disabled=\{busy \|\| picked\.length === 0 \|\| \(forPayment && !amountsValid\) \|\| comboBlocksSubmit\}/);
    expect(sheet).toMatch(/disabled=\{busy \|\| linesLocked \|\| comboBlocksSubmit\}/);
  });

  it('says why, not just that it is disabled', () => {
    expect(sheet).toMatch(/\{comboBlocksSubmit && \(/);
    expect(sheet).toMatch(/copy\.newVisit\.comboBlocksExtra\(comboTitle \?\? copy\.newVisit\.combo\)/);
    expect(copy.newVisit.comboBlocksExtra('Weekly glow')).toMatch(/Weekly glow/);
  });
});

describe('removing the combo does not throw away what was added beside it', () => {
  it('extras become the plain list instead of disappearing', () => {
    expect(sheet).toMatch(/const removeCombo = \(\) => \{\s*setPicked\(extras\);\s*setExtras\(\[\]\);/);
  });
});
