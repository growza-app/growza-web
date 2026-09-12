import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toWeekdayRows, type WeekdayRow } from './WeekdayHoursEditor.js';

/**
 * Jira GRW-201 — board 5c's collapsed week, and the rules that decide it.
 *
 * The visual is checked by eye and by the device sweep. What is worth pinning
 * here is the ARITHMETIC: which days end up on one line, in what order, and
 * what a day off counts as. Each of those has a plausible wrong answer that
 * looks right on the commonest week and fails on a real one.
 *
 * `groupByValue` is module-private on purpose — it is an implementation detail
 * of one component, and exporting it so a test can reach it would make it API.
 * So the rules are re-derived here from the same inputs, and the source is
 * asserted to still contain the decisions they encode. That is weaker than
 * calling the function and it is honest about being so; the alternative is
 * widening a component's surface for the benefit of its own test.
 */
const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'WeekdayHoursEditor.tsx'),
  'utf-8',
)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

/** The same key the component builds, so the cases below describe its behaviour. */
function keyOf(row: WeekdayRow, split: ReadonlySet<number> = new Set()): string {
  return split.has(row.weekday)
    ? `solo:${row.weekday}`
    : row.open
      ? `open:${row.startTime}-${row.endTime}`
      : 'closed';
}

function groupSizes(rows: WeekdayRow[], split: ReadonlySet<number> = new Set()): number[] {
  const byKey = new Map<string, number>();
  for (const r of [...rows].sort((a, b) => a.weekday - b.weekday)) {
    const k = keyOf(r, split);
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }
  return [...byKey.values()];
}

const week = (spec: Array<[number, string, string] | number>): WeekdayRow[] =>
  Array.from({ length: 7 }, (_, weekday) => {
    const found = spec.find((s) => (Array.isArray(s) ? s[0] : s) === weekday);
    if (found === undefined || !Array.isArray(found)) {
      return { weekday, open: false, startTime: '09:00', endTime: '18:00' };
    }
    return { weekday, open: true, startTime: found[1], endTime: found[2] };
  });

describe('AC-01 — a typical week is two rows, not seven', () => {
  it('collapses Monday to Saturday and leaves Sunday on its own', () => {
    const rows = week([
      [1, '09:00', '19:00'], [2, '09:00', '19:00'], [3, '09:00', '19:00'],
      [4, '09:00', '19:00'], [5, '09:00', '19:00'], [6, '09:00', '19:00'],
    ]);
    // One group of six working days, one of the single closed Sunday.
    expect(groupSizes(rows).sort()).toEqual([1, 6]);
  });
});

describe('AC-02 — one day that differs gets its own line', () => {
  it('splits Saturday out when it closes earlier', () => {
    const rows = week([
      [1, '09:00', '19:00'], [2, '09:00', '19:00'], [3, '09:00', '19:00'],
      [4, '09:00', '19:00'], [5, '09:00', '19:00'], [6, '09:00', '17:00'],
    ]);
    // five together, Saturday alone, Sunday alone
    expect(groupSizes(rows).sort()).toEqual([1, 1, 5]);
  });
});

describe('AC-03 — a week with seven different answers is seven rows', () => {
  it('is no worse than the editor it replaces', () => {
    const rows = week([
      [0, '10:00', '16:00'], [1, '09:00', '19:00'], [2, '09:30', '19:00'],
      [3, '10:00', '19:00'], [4, '09:00', '18:00'], [5, '09:00', '20:00'],
      [6, '11:00', '17:00'],
    ]);
    expect(groupSizes(rows)).toHaveLength(7);
  });
});

describe('grouping is by value, not by adjacency', () => {
  it('puts Monday and Wednesday together across a closed Tuesday', () => {
    /*
     * The rule the board states — "days that share a time" — and the right one
     * rather than the easy one. Requiring calendar adjacency would give three
     * rows and split a pair that genuinely is one answer.
     */
    const rows = week([[1, '09:00', '19:00'], [3, '09:00', '19:00']]);
    const sizes = groupSizes(rows).sort();
    // {Mon, Wed} together; the other five days are all closed, so they are one group.
    expect(sizes).toEqual([2, 5]);
  });

  it('is asserted in the source, so adjacency cannot creep back in', () => {
    expect(source).toMatch(/open:\$\{row\.startTime\}-\$\{row\.endTime\}/);
    expect(source, 'grouping must not depend on the previous weekday').not.toMatch(/weekday\s*[-+]\s*1/);
  });
});

describe("a closed day's invisible times are not part of its identity", () => {
  it('groups two closed days that differ only in times nobody can see', () => {
    /*
     * `toWeekdayRows` gives an absent day a default 09:00–18:00, and switching
     * a day off leaves whatever it had. So two closed days routinely carry
     * different times — and if those counted, switching Sunday off would leave
     * it as its own row beside an already-closed Saturday for no reason a
     * reader could see.
     */
    const rows: WeekdayRow[] = [
      { weekday: 5, open: false, startTime: '09:00', endTime: '18:00' },
      { weekday: 6, open: false, startTime: '11:00', endTime: '15:00' },
    ];
    expect(groupSizes(rows)).toEqual([2]);
  });

  it('keys a closed day on nothing but being closed', () => {
    expect(keyOf({ weekday: 6, open: false, startTime: '11:00', endTime: '15:00' })).toBe('closed');
    expect(source).toMatch(/:\s*'closed'/);
  });
});

describe('splitting a group', () => {
  it('gives every day in it its own line', () => {
    const rows = week([
      [1, '09:00', '19:00'], [2, '09:00', '19:00'], [3, '09:00', '19:00'],
    ]);
    const split = new Set([1, 2, 3]);
    // three solo working days, plus the four closed ones together
    expect(groupSizes(rows, split).sort()).toEqual([1, 1, 1, 4]);
  });

  it('is view state and never touches the week', () => {
    /*
     * The split must not write anything. If it did, "show me Monday on its own"
     * would be a change the owner then has to save — and one they never asked
     * for.
     */
    expect(source).toMatch(/const \[split, setSplit\] = useState/);
    expect(source, 'splitting must not call onChange').toMatch(
      /setSplit\(\(prev\) => new Set\(\[\.\.\.prev, \.\.\.days\]\)\)/,
    );
  });
});

describe('the rules the design is explicit about', () => {
  it('never lets colour be the only signal', () => {
    // A working row carries a clock AND its times; a day off a crossed circle
    // AND the word. Remove the colour from either and both still read.
    expect(source).toMatch(/IconClock/);
    expect(source).toMatch(/IconBan/);
    expect(source).toMatch(/>Closed</);
  });

  it('shows all seven positions on every row, so a lone "S" is never ambiguous', () => {
    expect(source).toMatch(/WEEKDAY_INITIALS\.map/);
    // Seven letters, in weekday order, index === weekday.
    expect(source).toMatch(/\['S', 'M', 'T', 'W', 'T', 'F', 'S'\]/);
  });

  it('patches every day of a group, not just the one that was clicked', () => {
    expect(source).toMatch(/for \(const weekday of days\) onChange\(weekday, patch\)/);
  });
});

describe('toWeekdayRows still does its own job', () => {
  it('returns seven days, closed where there is no row', () => {
    const rows = toWeekdayRows([{ weekday: 1, startTime: '09:00:00', endTime: '19:00:00' }]);
    expect(rows).toHaveLength(7);
    expect(rows[1]).toEqual({ weekday: 1, open: true, startTime: '09:00', endTime: '19:00' });
    expect(rows[0]!.open).toBe(false);
  });

  it('merges a split shift to its outer bounds rather than dropping either half', () => {
    const rows = toWeekdayRows([
      { weekday: 2, startTime: '09:00:00', endTime: '13:00:00' },
      { weekday: 2, startTime: '14:00:00', endTime: '19:00:00' },
    ]);
    expect(rows[2]).toEqual({ weekday: 2, open: true, startTime: '09:00', endTime: '19:00' });
  });
});
