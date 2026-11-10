import { describe, expect, it } from 'vitest';
import { businessHealth } from './business-health';

/** Jira GRW-701 — the health line. Days are IST. */
const NOW = new Date('2026-11-10T15:00:00+05:30');
const created = '2026-09-01T10:00:00+05:30';

describe('business health line', () => {
  it('AC-01 — active 2 days ago, with this week’s count', () => {
    expect(businessHealth({ lastActiveAt: '2026-11-08T12:00:00+05:30', weekActivity: 34, createdAt: created }, NOW)).toEqual({
      text: 'Active 2 days ago · 34 bookings & bills this week',
      quiet: false,
    });
  });

  it('today and yesterday by the IST day, and one in the singular', () => {
    expect(businessHealth({ lastActiveAt: '2026-11-10T00:10:00+05:30', weekActivity: 1, createdAt: created }, NOW)?.text).toBe('Active today · 1 booking or bill this week');
    expect(businessHealth({ lastActiveAt: '2026-11-09T23:50:00+05:30', weekActivity: 3, createdAt: created }, NOW)?.text).toMatch(/^Active yesterday/);
  });

  it('AC-02 — 14 days with nothing is quiet, in the warning colour', () => {
    expect(businessHealth({ lastActiveAt: '2026-10-27T10:00:00+05:30', weekActivity: 0, createdAt: created }, NOW)).toEqual({ text: 'Quiet 14 days', quiet: true });
    expect(businessHealth({ lastActiveAt: '2026-10-28T10:00:00+05:30', weekActivity: 0, createdAt: created }, NOW)?.quiet).toBe(false);
    expect(businessHealth({ lastActiveAt: null, weekActivity: 0, createdAt: '2026-01-01T10:00:00+05:30' }, NOW)).toEqual({ text: 'Quiet for over 90 days', quiet: true });
  });

  it('AC-03 — enrolled today with nothing is New today, not quiet', () => {
    expect(businessHealth({ lastActiveAt: null, weekActivity: 0, createdAt: '2026-11-10T09:00:00+05:30' }, NOW)).toEqual({ text: 'New today', quiet: false });
    expect(businessHealth({ lastActiveAt: null, weekActivity: 0, createdAt: '2026-11-05T09:00:00+05:30' }, NOW)?.text).toBe('No bookings or bills yet');
  });

  it('says nothing when the API does not send activity', () => {
    expect(businessHealth({ createdAt: created }, NOW)).toBeNull();
  });
});
