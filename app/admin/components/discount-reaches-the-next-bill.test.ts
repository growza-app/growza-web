import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The discount dialog says which bill it reaches.
 *
 * An issued bill never moves (GRW-256), so a discount set now is on the NEXT one. That had an exception — a
 * business's first bill was re-priced in place — and which bill came out free depended on whether the owner had
 * paid yet. Billing now starts at go-live and an offer is set on the enrol form, so the rule holds every month
 * and the dialog can state it. A business not live yet has no bill at all; its first one is the go-live bill.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const dialog = readFileSync(path.join(here, 'DiscountModal.tsx'), 'utf-8');
const panel = readFileSync(path.join(here, 'SubscriptionPanel.tsx'), 'utf-8');
const detail = readFileSync(path.join(here, '../businesses/[id]/page.tsx'), 'utf-8');

describe('the dialog', () => {
  it('says the current bill does not change, and names the day the next one falls on', () => {
    expect(dialog).toContain('Applies from the next bill on ');
    expect(dialog).toContain('The current bill does not change.');
    expect(dialog).toContain('formatDateOnly(subscription.nextBillingDate)');
  });

  it('says a business that is not live yet gets it on its first bill', () => {
    expect(dialog).toContain("subscription?.liveYet === false");
    expect(dialog).toContain('raised when it goes live');
  });

  it('falls back to the rule alone when the host does not know the date', () => {
    // `liveYet` and `nextBillingDate` are both optional, so an older host still renders a true sentence.
    expect(dialog).toContain('liveYet?: boolean;');
    expect(dialog).toContain('nextBillingDate?: string;');
    expect(dialog).toContain("'Applies from the next bill. The current bill does not change.'");
  });
});

describe('what the host passes', () => {
  it('the panel hands the dialog whether the business is live', () => {
    expect(panel).toContain('businessLive?: boolean;');
    expect(panel).toContain('liveYet: businessLive');
  });

  it('the business page knows the answer and gives it', () => {
    expect(detail).toContain("businessLive={business.status !== 'provisioning'}");
  });
});
