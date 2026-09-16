import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copy } from '../lib/copy';

/**
 * Jira GRW-289 — two Record payment defects at the till, read from source.
 *
 * NewVisitSheet and CheckoutSheet are client components with no DOM in this
 * test environment (the same reason walk-in-opens-now.test.ts reads source);
 * the decisions under test are each one expression.
 */
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');
const till = readFileSync(resolve(__dirname, 'CheckoutSheet.tsx'), 'utf8');

/** The body of `openCheckout`, up to the next top-level const. */
const openCheckout = sheet.slice(sheet.indexOf('const openCheckout = async'), sheet.indexOf('const queueIt = async'));

describe('a till that cannot open says so in our words, not the browser’s', () => {
  it('never shows a raw Error message — "Failed to fetch" is an Error', () => {
    expect(openCheckout).not.toMatch(/error instanceof Error \? error\.message/);
  });

  it('shows the API’s own sentence only for an answered, explained refusal; otherwise tillFailed', () => {
    expect(openCheckout).toMatch(
      /error instanceof ApiError && error\.status < 500 && error\.code \? error\.message : copy\.newVisit\.tillFailed/,
    );
  });
});

describe('closing the till without saving does not pass for paid', () => {
  it('CheckoutSheet tells a save apart from walking away', () => {
    expect(till).toMatch(/onSaved\?: \(\) => void;/);
    expect(till).toMatch(/\(onSaved \?\? onClose\)\(\);/);
    // Cancel and the backdrop are still onClose — walking away.
    expect(till).toMatch(/className="modal-backdrop" onClick=\{busy \? undefined : onClose\}/);
  });

  it('Record payment: Cancel, close or backdrop returns to the done screen with the unpaid notice', () => {
    expect(sheet).toMatch(/if \(forPayment\) setTillClosedUnpaid\(true\);\s*else onClose\(\);/);
    expect(sheet).toMatch(/tillClosedUnpaid && <div[^>]*>\{copy\.newVisit\.notPaidYet\}<\/div>/);
  });

  it('a save still closes everything', () => {
    expect(sheet).toMatch(/onSaved=\{\(\) => \{\s*setCheckoutRows\(null\);\s*onClose\(\);/);
  });

  it('reopening the till clears the notice', () => {
    expect(openCheckout).toMatch(/setTillClosedUnpaid\(false\)/);
  });

  it('the notice is plain: saved, not paid, and where to pay', () => {
    expect(copy.newVisit.notPaidYet).toMatch(/saved/);
    expect(copy.newVisit.notPaidYet).toMatch(/not paid/);
    expect(copy.newVisit.notPaidYet).toMatch(/Bookings/);
  });
});
