import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dialable, waDigits } from './BookingSheet';

/**
 * Owner-app audit 2026-10-10 — a `tel:` link keeps its `+`.
 *
 * `dialable` stripped every non-digit, so the booking card, the action sheet and the checkout sheet dialled
 * `tel:919876543207` while the client profile dialled `tel:+919876543207`; without the `+` a handset treats the
 * twelve digits as a local number. `wa.me` is the one that wants digits alone, and now has its own helper.
 */
describe('tel: and wa.me numbers', () => {
  it('dialable keeps the + and drops the spaces', () => {
    expect(dialable('+91 98765 43207')).toBe('+919876543207');
    expect(dialable('+919876543207')).toBe('+919876543207');
    expect(dialable('98765 43207')).toBe('9876543207');
    expect(dialable(null)).toBe('');
    expect(dialable('')).toBe('');
  });

  it('waDigits is digits only', () => {
    expect(waDigits('+91 98765 43207')).toBe('919876543207');
    expect(waDigits(null)).toBe('');
  });

  it('no wa.me link is built from dialable, and no tel: link from waDigits', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    // Every wa.me link in the app is built from waDigits — not from dialable, and not from a variable that might
    // hold dialable's output (the booking sheet's `digits` did, and the first version of this test missed it).
    const all = ['../customers/CustomersClient.tsx', './ReceiptShare.tsx', './BookingSheet.tsx', './BookingSummary.tsx', './DaySchedule.tsx', './CheckoutSheet.tsx', '../appointments/BookingsList.tsx', '../search/SearchClient.tsx'];
    for (const file of all) {
      for (const m of read(file).matchAll(/wa\.me\/\$\{([^}]*)\}/g)) {
        expect(m[1], `${file}: wa.me/\${${m[1]}}`).toMatch(/^waDigits\(/);
      }
    }
    for (const file of ['./BookingSheet.tsx', './BookingSummary.tsx', './DaySchedule.tsx', './CheckoutSheet.tsx', '../appointments/BookingsList.tsx', '../search/SearchClient.tsx']) {
      expect(read(file)).toMatch(/tel:\$\{(dialable\(|digits)/);
      expect(read(file)).not.toMatch(/tel:\$\{waDigits\(/);
    }
  });
});
