import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../lib/dashboard-root';

/**
 * Record payment: the stylist row is names only, and nobody is the answer until one is tapped.
 *
 * "Whoever is free" assigns a visit that has already happened to someone who did not do it, and "No stylist" was the
 * chip that undid that. Both go; tapping the chosen name again puts it back to nobody.
 */
const sheet = readFileSync(fromDashboard('app/(tenant)/components/NewVisitSheet.tsx'), 'utf-8');

describe('Record payment and the stylist', () => {
  it('starts as nobody, so a payment with no name taps goes through the counter sale', () => {
    expect(sheet).toContain('useState(forPayment)');
    expect(sheet).toMatch(/if \(forPayment && noStylist\) \{/);
  });

  it('never offers Whoever is free', () => {
    expect(sheet).toContain('const offersWhoever = !forPayment && ');
  });

  it('has no No stylist chip', () => {
    expect(sheet).not.toMatch(/value: WI_NO_STYLIST, label: noProviderWord/);
  });

  it('lets a second tap on the chosen name clear it', () => {
    expect(sheet).toContain('pickStylist(forPayment && stylistValue === o.value ? WI_NO_STYLIST : o.value)');
  });
});
