import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-736 — fix: QA of the overnight stack (item 1). "Complete sale" and "Keep payment pending", tapped within
 * ~300 ms of a change to the bill, did nothing: `pay()` returned early while the offers quote (or the points quote) was in
 * flight, and the tap was lost. Eleven restaurant specs and retail spec 05 failed on it.
 *
 * Pinned in the source, like the other till rules: the tap is HELD while the quote is asked (the button shows it is busy
 * and is disabled, because `saving` is set), and the held tap completes the sale once the quote is in.
 */
const src = readFileSync(resolve(__dirname, 'PayFlow.tsx'), 'utf8');
const pay = src.slice(src.indexOf('  const pay = async (mode: PaymentMode, pending = false) => {'), src.indexOf('  /** The save itself, once what is owed is known. */'));

describe('a payment tapped while the quote is asked waits for it, then completes', () => {
  it('pay() no longer returns early on a quote in flight', () => {
    expect(pay.length).toBeGreaterThan(0);
    expect(pay).not.toMatch(/billOffers\.checking[^\n]*\)\)\s*return;/);
    expect(pay).not.toMatch(/pointsChecking[^\n]*\)\s*return;/);
  });

  it('the tap marks the button busy, then is held while quoting', () => {
    const busy = pay.indexOf('setSaving(mode);');
    const held = pay.indexOf('setHeldTap({ mode, pending });');
    expect(busy).toBeGreaterThan(0);
    expect(held).toBeGreaterThan(busy);
    expect(pay).toMatch(/if \(quoting\) \{\s*setHeldTap\(\{ mode, pending \}\);\s*return;\s*\}/);
  });

  it('quoting covers the points, the offers and GST on top, as the old guard did', () => {
    expect(src).toContain('const quoting = pointsChecking || (offersHere && (billOffers.checking || (billOffers.taxOnTop && !taxOnTopNow)));');
  });

  it('the held tap completes as soon as the quote is in, or lets go when the bill cannot be paid', () => {
    expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(!heldTap \|\| quoting\) return;[\s\S]{0,400}void completePay\(tap\.mode, tap\.pending\);/);
    expect(src).toMatch(/if \(lines\.length === 0 \|\| freeBlock \|\| splitTooBig\) \{\s*setSaving\(null\);\s*return;\s*\}/);
  });

  it('every payment button is disabled while saving, which covers the held tap', () => {
    for (const m of src.matchAll(/onClick=\{\(\) => void pay\('upi'\)\} disabled=\{([^}]*)\}/g)) expect(m[1]).toContain('saving !== null');
  });
});
