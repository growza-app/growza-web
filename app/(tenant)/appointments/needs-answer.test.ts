import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { copy } from '../lib/copy.js';

/**
 * Jira GRW-214 — the bookings nobody has said anything about.
 *
 * Seven of Glow Salon's twelve past bookings sat in `confirmed` forever:
 * served, almost certainly, and recorded as neither done nor missed. Every
 * rule for counting a visit breaks on that, because no counting rule can
 * recover what was never written down — so the fix is to make the omission
 * visible on the day, not to guess afterwards.
 *
 * The arithmetic is what matters here and it has one plausible wrong answer:
 * counting from `startAt`, which makes a booking overdue while the customer is
 * still in the chair.
 */
const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'BookingsList.tsx'),
  'utf-8',
);

interface Row {
  status: string;
  endAt: string;
}

/** The same predicate the component applies, so these cases describe its behaviour. */
const needsAnswer = (rows: Row[], now: Date) =>
  rows.filter((b) => b.status === 'confirmed' && new Date(b.endAt).getTime() <= now.getTime());

const NOW = new Date('2026-09-12T15:00:00+05:30');
const at = (hhmm: string) => `2026-09-12T${hhmm}:00+05:30`;

describe('what counts as needing an answer', () => {
  it('counts a confirmed booking whose time has passed', () => {
    expect(needsAnswer([{ status: 'confirmed', endAt: at('14:30') }], NOW)).toHaveLength(1);
  });

  it('does not count one that is still running', () => {
    /*
     * `endAt`, not `startAt`. A booking that started at 14:30 and runs to
     * 15:30 is in progress — asking the receptionist to settle it while the
     * customer is in the chair is how a prompt teaches people to ignore it.
     */
    expect(needsAnswer([{ status: 'confirmed', endAt: at('15:30') }], NOW)).toHaveLength(0);
  });

  it('treats the exact end moment as needing an answer', () => {
    // <= rather than <: at 15:00 sharp the booking is over.
    expect(needsAnswer([{ status: 'confirmed', endAt: at('15:00') }], NOW)).toHaveLength(1);
  });

  it('ignores anything already settled', () => {
    const rows = [
      { status: 'completed', endAt: at('10:00') },
      { status: 'no_show', endAt: at('11:00') },
      { status: 'cancelled', endAt: at('12:00') },
    ];
    expect(needsAnswer(rows, NOW)).toHaveLength(0);
  });

  it('counts several, and only the unsettled ones', () => {
    const rows = [
      { status: 'confirmed', endAt: at('10:00') },
      { status: 'completed', endAt: at('11:00') },
      { status: 'confirmed', endAt: at('12:00') },
      { status: 'confirmed', endAt: at('16:00') },
    ];
    expect(needsAnswer(rows, NOW)).toHaveLength(2);
  });

  it('is asserted in the source, so startAt cannot creep back in', () => {
    const i = source.indexOf('const isUnmarked =');
    const block = source.slice(i, i + 200);
    expect(block).toContain('endAt');
    expect(block, 'a running booking is not overdue').not.toContain('startAt');
  });

  it('counts and filters through ONE predicate, so the strip cannot promise a different number from what it opens', () => {
    /*
     * The first version reused `status=confirmed` for the filter while counting
     * `confirmed AND finished` — so the strip said 7 and opened 9, including
     * two the receptionist could not act on yet. A prompt whose count does not
     * match what it opens teaches people to distrust the count.
     *
     * `isUnmarked` is now the only definition, used by both.
     */
    expect(source).toMatch(/const isUnmarked = \(b: BookingGroup\)/);
    expect(source, 'the filter uses it').toMatch(/!unmarkedOnly \|\| isUnmarked\(b\)/);
    expect(source, 'the count uses it').toMatch(/needsAnswer = bookings\.filter\([\s\S]{0,80}isUnmarked\(b\)/);
  });

  it('the count ignores the filter it turns on, so it does not read zero once applied', () => {
    // Counted from `bookings`, not from `filtered` — otherwise switching the
    // filter on would narrow the very list the count is taken from.
    expect(source).toMatch(/needsAnswer = bookings\.filter/);
  });
});

describe('the strip says the right thing to whoever is reading it', () => {
  it('asks the receptionist to act', () => {
    expect(copy.bookings.needsAnswer(3, false)).toBe('3 bookings have finished and are not marked yet');
  });

  it('tells a stylist it is THEIR work that is unrecorded', () => {
    /*
     * The whole control, in one word: "your". A stylist reading a salon-wide
     * count has nothing to challenge; a stylist reading that two of their own
     * haircuts are unmarked is the only person in the building who knows for
     * certain that they happened.
     */
    expect(copy.bookings.needsAnswer(2, true)).toBe('2 of your bookings have finished and are not marked');
  });

  it('reads correctly for exactly one', () => {
    expect(copy.bookings.needsAnswer(1, false)).toBe('1 booking has finished and is not marked yet');
    expect(copy.bookings.needsAnswer(1, true)).toBe('1 of your bookings has finished and is not marked');
  });

  it('hides itself once the list is already filtered to them', () => {
    // Otherwise it sits above its own result offering to do what it just did.
    expect(source).toContain('needsAnswer.length > 0 && !unmarkedOnly');
  });

  it('offers a way back out, because the status dropdown cannot show this filter', () => {
    /*
     * `unmarkedOnly` is not one of the dropdown's values, so while it is on the
     * dropdown still reads "All bookings" and the list is narrowed by something
     * invisible. A filter a person cannot see is one they cannot undo.
     */
    expect(source).toContain('bk-needs-answer-active');
    expect(source).toContain('setUnmarkedOnly(false)');
    expect(copy.bookings.needsAnswerActive(7)).toBe('Showing 7 not marked');
    expect(copy.bookings.needsAnswerClear).toBe('Show all');
  });

  it('counts as a filter, so the empty state offers to clear it', () => {
    expect(source).toMatch(/statusFilter !== '' \|\| unmarkedOnly/);
  });
});
