import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { billingCopy } from '../../lib/billing-copy';
import { isLive } from '../../lib/go-live';

/**
 * Billing starts when the salon goes live, and the Billing screen says so.
 *
 * While a business is still being set up the API raises no invoice at all, and the day its first bill falls on
 * moves to whenever it goes live. Naming a date before then would be naming a day the owner cannot act on, for a
 * month they cannot use.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, 'BillingSummary.tsx'), 'utf-8');
const page = readFileSync(path.join(here, 'page.tsx'), 'utf-8');

describe('the words', () => {
  it('say nothing is charged during setup, in both languages', () => {
    for (const lang of ['en', 'hi'] as const) {
      expect(billingCopy(lang).billingStartsAtGoLive.length).toBeGreaterThan(10);
      expect(billingCopy(lang).firstBill.length).toBeGreaterThan(2);
    }
    expect(billingCopy('en').billingStartsAtGoLive).toContain('goes live');
    expect(billingCopy('en').firstBill).toBe('Your first bill');
  });

  it('are not the same string in Hindi as in English — an untranslated line is a bug, not a default', () => {
    expect(billingCopy('hi').billingStartsAtGoLive).not.toBe(billingCopy('en').billingStartsAtGoLive);
  });
});

describe('the figures add up', () => {
  it('the plan card totals THIS period, so its total is the sum of the lines above it', () => {
    // A one-month offer makes `nextBill` the full price while the discount line still says −₹799. Totalling the
    // next bill there printed "Growza Prime ₹799 / Discount −₹799 / Monthly ₹799".
    expect(src).toContain('money(sub.monthlyMinor ?? sub.nextBill.amountMinor)');
  });

  it('a salon that is not live yet is shown its FIRST bill, discount included', () => {
    expect(src).toContain('money(live ? sub.nextBill.amountMinor : (sub.monthlyMinor ?? sub.nextBill.amountMinor))');
  });

  it('falls back to the next bill when an older API does not send it', () => {
    expect(readFileSync(path.join(here, '../../lib/api-types.ts'), 'utf-8')).toContain('monthlyMinor?: number;');
  });
});

describe('the card', () => {
  it('swaps the heading and shows the notice only while the salon is not live', () => {
    expect(src).toContain('{live ? (');
    expect(src).toContain('t.firstBill');
    expect(src).toContain('{live ? null : (');
    expect(src).toContain('t.billingStartsAtGoLive');
  });

  it('defaults to live, so a degraded session is never told its billing has not started', () => {
    expect(src).toContain('live = true');
    expect(isLive(undefined)).toBe(true);
    expect(isLive(null)).toBe(true);
    expect(isLive('active')).toBe(true);
    expect(isLive('suspended')).toBe(true);
    expect(isLive('provisioning')).toBe(false);
  });

  it('the page asks `/me` for the status rather than guessing', () => {
    expect(page).toContain('isLive(me?.tenant?.status)');
  });
});

describe('a business enrolled before billing started at go-live', () => {
  it('is shown its bill, not "nothing is charged", when it already holds one', () => {
    expect(page).toContain('billing.invoices.length > 0');
    expect(page).toContain('billing.due !== null');
    expect(page).toContain('live={isLive(me?.tenant?.status) ||');
  });
});
