import { describe, expect, it } from 'vitest';
import { POINTS, WORTH, pointsFor, pointsTemplate, rupees, shortDay } from './points-reminder';

/** Owner, 2026-11-27 — remind guests whose points are waiting: their numbers, the restaurant named, no name, no "Hi". */
describe('the points reminder', () => {
  const words = pointsTemplate('Spice Garden');

  it('names the restaurant and leaves the numbers for each guest', () => {
    expect(words).toBe(`You have ${POINTS} points at Spice Garden, worth ${WORTH}. Use them on your next visit 🎁`);
    expect(pointsTemplate(null)).toContain(' at us, ');
    expect(words).not.toMatch(/^(hi|hello|dear)\b/i);
  });

  it("fills each guest's points and worth; nothing about expiry when nothing dies this month", () => {
    expect(pointsFor(words, { points: 1450, worthMinor: 145_000, expiring: null })).toBe(
      'You have 1,450 points at Spice Garden, worth ₹1,450. Use them on your next visit 🎁',
    );
  });

  it('says how many die and when — "They" when all of them do', () => {
    expect(pointsFor(words, { points: 900, worthMinor: 90_000, expiring: { points: 120, on: '2026-12-05' } })).toBe(
      'You have 900 points at Spice Garden, worth ₹900. Use them on your next visit 🎁 120 of them expire on 5 Dec.',
    );
    expect(pointsFor(words, { points: 600, worthMinor: 60_000, expiring: { points: 600, on: '2027-01-01' } })).toMatch(/They expire on 1 Jan\.$/);
  });

  it('keeps the edited words, and the day is the one named whatever the reader’s clock', () => {
    expect(pointsFor(`${POINTS} pts = ${WORTH}`, { points: 500, worthMinor: 25_050, expiring: null })).toBe('500 pts = ₹250.5');
    expect(shortDay('2026-12-31')).toBe('31 Dec');
    expect(rupees(50_000)).toBe('₹500');
  });
});
