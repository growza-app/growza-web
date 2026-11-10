import { describe, expect, it } from 'vitest';
import { attentionLine, type NeedsAttentionRow } from './NeedsAttention';

/** Jira GRW-700 — each reason in plain words, with the one place to deal with it. */
const NOW = new Date('2026-11-10T15:00:00+05:30');
const row = (kind: NeedsAttentionRow['kind'], since: string): NeedsAttentionRow => ({ tenantId: 'abc', name: 'Meera Beauty Lounge', kind, since });

describe('needs attention, in words', () => {
  it('a failed payment opens the business billing', () => {
    expect(attentionLine(row('payment_failed', '2026-11-10T08:00:00Z'), NOW)).toEqual({
      reason: 'Payment failed this month',
      action: 'Open billing',
      href: '/admin/businesses/abc?tab=billing',
    });
  });

  it('setup stuck says for how long and opens the checklist', () => {
    expect(attentionLine(row('setup_stuck', '2026-11-01T09:00:00+05:30'), NOW)).toMatchObject({ reason: 'Still setting up after 9 days', href: '/admin/businesses/abc' });
  });

  it('a trial says today, tomorrow or the date, by the IST day', () => {
    expect(attentionLine(row('trial_ending', '2026-11-09T18:30:00Z'), NOW).reason).toBe('Trial ends today');
    expect(attentionLine(row('trial_ending', '2026-11-10T18:30:00Z'), NOW).reason).toBe('Trial ends tomorrow');
    expect(attentionLine(row('trial_ending', '2026-11-11T18:30:00Z'), NOW).reason).toBe('Trial ends 12 Nov');
    expect(attentionLine(row('trial_ending', '2026-11-08T18:30:00Z'), NOW).reason).toBe('Trial has ended');
    expect(attentionLine(row('trial_ending', '2026-11-11T18:30:00Z'), NOW).href).toBe('/admin/businesses/abc?tab=subscription');
  });
});
