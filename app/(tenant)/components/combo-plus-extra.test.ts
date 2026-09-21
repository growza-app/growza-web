import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';

/**
 * Jira GRW-292 — adding a service beside a combo used to dissolve the whole
 * combo back to individual full-price rows, silently: `addService` cleared
 * `offerId`, and the server's `assertOfferPricesTheseServices` would have
 * refused the offer anyway once `serviceIds` no longer matched it exactly —
 * so the sheet had to give up the discount to keep working, and never said
 * so. Owner-reported bug, 2026-09-16.
 *
 * The fix: the combo's own `picked` never changes once chosen. Anything
 * added alongside it becomes an `extras` row instead.
 *
 * Jira GRW-297 — Walk-in now / For later used to refuse to submit at all
 * while an extra sat beside a combo ("no second checkout step to settle it
 * through"). The server-side fix (`resolveComboServiceIds` in
 * `walk-in.ts`/`counter-sale.ts`, per-leg `offerId` in the booking route) made
 * that no longer true: `offerId`/its price is now applied per LEG, not to the
 * whole request, so an extra riding alongside a combo's `serviceIds` books as
 * its own leg at its own list price without diluting the combo's discount.
 * The restriction is gone; extras merge straight into the same request.
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

describe('Walk-in now / For later book a combo and its extras together', () => {
  const submit = sheet.slice(sheet.indexOf('const submit = async'), sheet.indexOf('if (checkoutRows && checkoutRows.length > 0'));

  it('there is no restriction left to block submit', () => {
    expect(sheet).not.toMatch(/comboBlocksSubmit/);
    expect(sheet).not.toMatch(/comboBlocksExtra/);
    expect(en.newVisit).not.toHaveProperty('comboBlocksExtra');
  });

  it('For later merges the extras into the same booking request', () => {
    expect(submit).toMatch(/serviceIds: \[\.\.\.picked, \.\.\.extras\]\.map\(\(p\) => p\.serviceId\),/);
  });

  it('plain Walk-in now merges extras too, but Record payment does not (extras go through payFor/checkout there instead)', () => {
    expect(submit).toMatch(/serviceIds: \(forPayment \? picked : \[\.\.\.picked, \.\.\.extras\]\)\.map\(\(p\) => p\.serviceId\),/);
  });
});

describe('removing the combo does not throw away what was added beside it', () => {
  it('extras become the plain list instead of disappearing', () => {
    expect(sheet).toMatch(/const removeCombo = \(\) => \{\s*setPicked\(extras\);\s*setExtras\(\[\]\);/);
  });
});
