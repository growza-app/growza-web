import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import { rupeesToMinor, splitComboRupees, type PickedItem } from './NewVisitSheet';

/**
 * Jira GRW-290 — Record payment settles on the services screen.
 *
 * The money rules are pure functions and are tested as such. The sheet is a
 * client component with no DOM here (see walk-in-opens-now.test.ts), so its
 * wiring is read from source; the device harness covers it in a browser.
 */
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');
const payFor = sheet.slice(sheet.indexOf('const payFor = async'), sheet.indexOf('const queueIt = async'));

const line = (priceMinor: string | null): PickedItem => ({ serviceId: 's', name: 'x', durationMin: 30, priceMinor });

describe('BR-02 — an amount may be 0, never blank or negative', () => {
  it.each([
    ['300', 30000],
    ['0', 0],
    ['99.5', 9950],
  ])('%s → %d', (typed, minor) => expect(rupeesToMinor(typed)).toBe(minor));

  it.each([[''], ['  '], ['-5'], ['abc'], [undefined]])('%s is not an amount', (typed) => {
    expect(rupeesToMinor(typed as string | undefined)).toBeNull();
  });
});

describe('AC-03 — a combo from search: its lines sum to the combo price', () => {
  it('splits ₹1,200 over ₹1,000 + ₹500 list prices, remainder on the last line', () => {
    const shares = splitComboRupees([line('100000'), line('50000')], '120000');
    expect(shares).toEqual(['800', '400']);
    expect(shares.reduce((sum, s) => sum + Number(s), 0)).toBe(1200);
  });

  it('never loses a paisa to rounding', () => {
    const shares = splitComboRupees([line('33300'), line('33300'), line('33300')], '100000');
    expect(shares.reduce((sum, s) => sum + Math.round(Number(s) * 100), 0)).toBe(100000);
  });

  it('with no combo price, each line is its own price', () => {
    expect(splitComboRupees([line('30000'), line(null)], null)).toEqual(['300', '0']);
  });
});

describe('FR-05 — one Mark done, no till', () => {
  it('Record payment no longer opens the till after saving the walk-in', () => {
    expect(sheet).not.toMatch(/if \(forPayment\) await openCheckout\(recorded\);/);
    expect(sheet).toMatch(/setSavedVisit\(recorded\);\s*await payFor\(client, recorded\);/);
  });

  it('settles every leg in one checkout with the typed amounts and the chosen mode', () => {
    expect(payFor).toMatch(/api\.checkout\(first, \{/);
    expect(payFor).toMatch(/paymentMode,/);
    expect(payFor).toMatch(/groupMembers: rest\.map/);
  });

  it('the button says Mark done and is disabled while an amount is unusable', () => {
    expect(en.newVisit.markDone).toBe('Mark done');
    // Jira GRW-297 — no longer also gated on comboBlocksSubmit; see combo-plus-extra.test.ts.
    // Jira GRW-456 added a fourth clause for a walk-in at a branch with no staff, which cannot start; Record
    // payment is untouched by it (`!forPayment`) and still turns on `amountsValid` alone.
    expect(sheet).toMatch(/disabled=\{busy \|\| picked\.length === 0 \|\| \(forPayment && !amountsValid\) \|\| \(!later && !forPayment && noStaffHere\)\}/);
  });
});

describe('AC-02 — a failed payment is retried against the same visit', () => {
  it('a retry pays the remembered visit instead of creating another', () => {
    expect(sheet).toMatch(/if \(forPayment && savedVisit\) \{\s*await payFor\(client, savedVisit\);\s*return;/);
  });

  it('a 409 whose legs are all completed is shown as paid, not as an error', () => {
    expect(payFor).toMatch(/error instanceof BookingConflictError/);
    expect(payFor).toMatch(/rows\.every\(\(r\) => r\.status === 'completed'\)/);
  });

  it('otherwise says the visit is saved and the payment is not, in our words for a network failure', () => {
    expect(payFor).toMatch(/error instanceof ApiError && error\.status < 500 \? error\.message : nv\.paymentNotSaved/);
    expect(en.newVisit.paymentNotSaved).toMatch(/saved/);
  });
});

describe('AC-04 — an empty catalogue is not "Loading"', () => {
  it('says loading only while the list is null, and says there are none when it is empty', () => {
    expect(en.newVisit.searchServices).not.toMatch(/Loading/);
    expect(sheet).toMatch(/services === null \? nv\.loadingServices/);
    expect(sheet).toMatch(/services\.length === 0 \? \(/);
    // Jira GRW-384 — empty says so: naming the branch when there are several, plainly when there is one.
    expect(sheet).toMatch(/nv\.noServicesAtBranch\(/);
    expect(sheet).toMatch(/<div className="empty">\{nv\.noServicesYet\}/);
  });
});
