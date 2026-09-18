import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statusChip } from '../lib/appointment-display';

/**
 * Jira GRW-307 — Search showed a booking with no status.
 *
 * A search for "Mohit Nair" listed "14 Sept · Deep Tissue Massage · Sana" under
 * Bookings and "0 visits" under Customers. Both were right — the booking was
 * still `confirmed`, and a visit counts only once it is marked completed — but
 * the row said nothing about what became of the booking, so it read as a service
 * he had had. The API always returned `status`; the row never drew it.
 */
const client = readFileSync(resolve(__dirname, 'SearchClient.tsx'), 'utf8');

describe('a search result says what became of the booking', () => {
  it('draws the status chip on every booking row', () => {
    expect(client).toMatch(/statusChip\(b\)/);
  });

  it('uses the same four words as the Bookings screen', () => {
    expect(statusChip({ status: 'confirmed' }).text).toBe('Confirmed');
    expect(statusChip({ status: 'completed' }).text).toBe('Completed');
    expect(statusChip({ status: 'no_show' }).text).toBe("Didn't come");
    expect(statusChip({ status: 'cancelled' }).text).toBe('Cancelled');
  });
});
