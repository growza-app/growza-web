import { describe, expect, it } from 'vitest';
import { changeOf, daysOf, fromSaved, withDay, withoutDay } from './day-edits';

/** Jira GRW-397 · GRW-398 — a closed-days list edited here and saved as just the days changed. */
describe('day edits', () => {
  const start = fromSaved(['2026-10-20', '2026-11-04']);

  it('shows saved, plus added, less removed, in order', () => {
    const e = withoutDay(withDay(start, '2026-10-02'), '2026-11-04');
    expect(daysOf(e)).toEqual(['2026-10-02', '2026-10-20']);
    expect(changeOf(e)).toEqual({ closedDatesAdd: ['2026-10-02'], closedDatesRemove: ['2026-11-04'] });
  });

  it('nothing changed sends nothing', () => {
    expect(changeOf(start)).toEqual({});
    // Added then taken away again is no change either.
    expect(changeOf(withoutDay(withDay(start, '2026-12-25'), '2026-12-25'))).toEqual({});
    // Removed then put back likewise.
    expect(changeOf(withDay(withoutDay(start, '2026-10-20'), '2026-10-20'))).toEqual({});
  });

  it('adding a saved day, or removing one not there, changes nothing', () => {
    expect(changeOf(withDay(start, '2026-10-20'))).toEqual({});
    expect(changeOf(withoutDay(start, '2027-01-01'))).toEqual({});
  });
});
