import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner's review 2026-11-13 — on a phone the register's first person sat at 509px of 844. The second heading
 * (the page header already says Attendance) is hidden there, and the five status tiles are one scrolling row of
 * pills instead of a 2×3 grid. A laptop keeps the heading and the tiles.
 */
const tsx = readFileSync(new URL('./AttendanceRegister.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/71-attendance-register.css', import.meta.url), 'utf8');

describe('the register on a phone', () => {
  it('hides the duplicate heading block at ≤860px only', () => {
    expect(tsx).toContain('<div className="att-head-text">');
    const phone = css.slice(css.indexOf('Owner\'s review 2026-11-13'));
    expect(phone).toMatch(/@media \(max-width: 860px\) \{\s*\.att-head-text \{\s*display: none;/);
    // Not hidden outside that query.
    expect(css.split('@media')[0]).not.toContain('.att-head-text');
  });

  it('turns the five tiles into one scrolling row of pills', () => {
    const phone = css.slice(css.indexOf('Owner\'s review 2026-11-13'));
    expect(phone).toMatch(/\.att-summary \{[^}]*display: flex;[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/);
    expect(phone).toMatch(/\.att-tile \{[^}]*flex: none;[^}]*min-height: 2\.25rem;[^}]*border-radius: 999px;/);
    // The old 2×3 compression block is gone.
    expect(css).not.toContain('minmax(104px, 1fr)');
  });
});
