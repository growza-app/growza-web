import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';

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
      /error instanceof ApiError && error\.status < 500 && error\.code \? error\.message : nv\.tillFailed/,
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

  /**
   * Jira GRW-451 — the rule lost its `if`.
   *
   * It read `if (forPayment) setTillClosedUnpaid(true); else onClose();`, and that condition was exactly
   * backwards: the till is only reachable from the `done` screen's "Take payment now", and `done` is only
   * reached when `forPayment` is false (Record payment settles inline and ends on `paid`). So the notice
   * branch was dead and the ONE purpose that opens a till — plain Walk-in now — took the `else` and had the
   * whole sheet closed under it, leaving a recorded unpaid visit with nothing on screen saying so.
   */
  it('leaving the till without saving always returns to the done screen with the unpaid notice', () => {
    const onCloseProp = sheet.slice(sheet.indexOf('onClose={() => {\n          setCheckoutRows(null);'));
    expect(onCloseProp).not.toMatch(/if \(forPayment\) setTillClosedUnpaid/);
    expect(sheet).toMatch(/onBack=\{\(\) => \{\s*setCheckoutRows\(null\);\s*setTillClosedUnpaid\(true\);/);
    expect(sheet).toMatch(/tillClosedUnpaid && <div[^>]*>\{nv\.notPaidYet\}<\/div>/);
  });

  it('a save still closes everything', () => {
    expect(sheet).toMatch(/onSaved=\{\(\) => \{\s*setCheckoutRows\(null\);\s*onClose\(\);/);
  });

  it('reopening the till clears the notice', () => {
    expect(openCheckout).toMatch(/setTillClosedUnpaid\(false\)/);
  });

  it('the notice is plain: saved, not paid, and where to pay', () => {
    expect(en.newVisit.notPaidYet).toMatch(/saved/);
    expect(en.newVisit.notPaidYet).toMatch(/not paid/);
    expect(en.newVisit.notPaidYet).toMatch(/Bookings/);
  });
});
