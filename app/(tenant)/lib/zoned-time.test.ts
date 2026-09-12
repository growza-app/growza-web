import { describe, expect, it } from 'vitest';
import { zonedDateTimeToUtc } from './zoned-time';

/**
 * Jira GRW-219 — the one direction of time conversion this app had never done.
 *
 * Written against fixed instants rather than against another call to the same
 * helper, which is the only way a conversion test says anything: a test that
 * computes the expected answer the way the code does agrees with any bug.
 */
describe('a wall-clock time in the salon’s zone', () => {
  it('reads 5:45 PM in Kolkata as 12:15 UTC', () => {
    expect(zonedDateTimeToUtc('2026-11-18', '17:45', 'Asia/Kolkata')?.toISOString()).toBe(
      '2026-11-18T12:15:00.000Z',
    );
  });

  it('handles the half-hour offset at midnight', () => {
    expect(zonedDateTimeToUtc('2026-11-18', '00:00', 'Asia/Kolkata')?.toISOString()).toBe(
      '2026-11-17T18:30:00.000Z',
    );
  });

  it('answers for the zone it is given, not the one the browser is in', () => {
    /*
     * The bug this helper exists to prevent. `new Date('2026-11-18T17:45')`
     * reads the BROWSER's zone, so a receptionist on a laptop still set to UTC
     * would move a booking five and a half hours wrong — and every screen
     * would then agree with itself about it.
     *
     * Asserted as a relationship between two zones rather than against the
     * host's own clock: a test written as "not what this machine would say" is
     * a test that passes or fails depending on where CI runs, and the first
     * run of this file found exactly that (the machine was `Asia/Calcutta`,
     * which is `Asia/Kolkata` under its older name).
     */
    const kolkata = zonedDateTimeToUtc('2026-11-18', '17:45', 'Asia/Kolkata')!;
    const london = zonedDateTimeToUtc('2026-11-18', '17:45', 'Europe/London')!;
    const utc = zonedDateTimeToUtc('2026-11-18', '17:45', 'UTC')!;

    expect(london.getTime()).toBe(utc.getTime()); // London is on UTC in November
    expect(utc.getTime() - kolkata.getTime()).toBe(5.5 * 60 * 60 * 1000);
  });

  describe('a zone that actually changes its clocks', () => {
    it('is right in winter', () => {
      expect(zonedDateTimeToUtc('2026-01-15', '09:00', 'America/New_York')?.toISOString()).toBe(
        '2026-01-15T14:00:00.000Z',
      );
    });

    it('is right in summer — the pass that a single-shot conversion gets wrong', () => {
      expect(zonedDateTimeToUtc('2026-07-15', '09:00', 'America/New_York')?.toISOString()).toBe(
        '2026-07-15T13:00:00.000Z',
      );
    });

    it('lands just after a spring-forward gap rather than a day away', () => {
      // 2:30 AM on 8 March 2026 does not exist in New York.
      const answer = zonedDateTimeToUtc('2026-03-08', '02:30', 'America/New_York')!;
      expect(answer.toISOString().slice(0, 10)).toBe('2026-03-08');
    });
  });

  describe('refuses what it cannot read', () => {
    for (const [date, time] of [
      ['18-11-2026', '17:45'],
      ['2026-11-18', '25:00'],
      ['2026-11-18', '17:75'],
      ['2026-11-18', ''],
      ['', '17:45'],
    ] as const) {
      it(`returns null for ${date || '(empty date)'} ${time || '(empty time)'}`, () => {
        expect(zonedDateTimeToUtc(date, time, 'Asia/Kolkata')).toBeNull();
      });
    }

    it('accepts a single-digit hour, which is what some time inputs emit', () => {
      expect(zonedDateTimeToUtc('2026-11-18', '9:05', 'Asia/Kolkata')?.toISOString()).toBe(
        '2026-11-18T03:35:00.000Z',
      );
    });
  });
});
