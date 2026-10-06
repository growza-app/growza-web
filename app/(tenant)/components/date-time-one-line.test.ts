import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-529 — the Booking date and Booking time share one row, not two stacked ones. Two equal columns; at
 * 344px each is ~130px, so the fields give back some padding so a full date is not cut off. (GRW-532: no "optional"
 * tag under either label.)
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const css = readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8');

describe('date and time on one line', () => {
  it('both fields sit in one wrapper', () => {
    const start = sheet.indexOf('<div className="wi-when">');
    expect(start).toBeGreaterThan(-1);
    const block = sheet.slice(start, sheet.indexOf('wi-actions', start));
    expect(block).toContain('id="wi-date"');
    expect(block).toContain('id="wi-time"');
    expect(block.indexOf('id="wi-date"')).toBeLessThan(block.indexOf('id="wi-time"'));
  });

  it('the wrapper is two equal columns that can shrink', () => {
    expect(css).toMatch(/\.wi-when \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  });

  it('the inputs give back padding so a full date fits', () => {
    expect(css).toMatch(/\.wi-when input \{[^}]*padding-inline: 10px;/);
    // The dropdown keeps room for its chevron.
    expect(css).toMatch(/\.wi-when select \{[^}]*padding-right: 28px;/);
  });
});

describe('no "optional" text under Booking date or Booking time (GRW-532)', () => {
  it('the two labels carry only their names', () => {
    const start = sheet.indexOf('<div className="wi-when">');
    const block = sheet.slice(start, sheet.indexOf('wi-actions', start));
    expect(block).not.toContain('field-optional');
    expect(block).not.toMatch(/tCommon\('optional'\)/);
    expect(block).toMatch(/<label htmlFor="wi-date">\s*\{nv\.bookingDate\}\s*<\/label>/);
    expect(block).toMatch(/<label htmlFor="wi-time">\s*\{nv\.bookingTime\}\s*<\/label>/);
  });
});
