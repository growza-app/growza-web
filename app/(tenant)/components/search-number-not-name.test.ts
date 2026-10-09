import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../lib/dashboard-root';

/**
 * Typing a phone number into the client search must not leave part of it in Name.
 *
 * The first six digits used to be seeded into Name (they are too few to be a phone), and when the seventh arrived the
 * rest went to Phone while Name kept "959942". Source checks, like the sheet's neighbouring tests.
 */
const source = readFileSync(fromDashboard('app/(tenant)/components/NewVisitSheet.tsx'), 'utf-8');

describe('what the search seeds', () => {
  it('treats a numeric search as a number, so it never reaches Name', () => {
    expect(source).toMatch(/if \(isNumberLike\(typed\)\) \{\s*if \(!nameEdited\.current\) setNewName\(''\);/);
  });

  it('seeds Phone only once there are seven digits, and clears it below that', () => {
    expect(source).toContain("setNewPhone(digitsOf(typed).length >= 7 ? typed : '')");
  });

  it('leaves what the desk typed themselves alone', () => {
    expect(source).toMatch(/if \(!phoneEdited\.current\) setNewPhone\(digitsOf/);
    expect(source).toMatch(/else if \(!nameEdited\.current\) \{\s*setNewName\(typed\);/);
  });
});
