import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from './dashboard-root';
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS, worthSearching } from './search-tuning';

/**
 * Jira GRW-422 — the two numbers behind "when do we ask the server", and the
 * rule that they are not written down anywhere else.
 *
 * They were `< 2` and `250` in three separate files, and that is exactly how
 * the Clients list ended up with no minimum at all — nobody noticed one copy
 * was missing. A test that only checked the values would not have caught that;
 * what catches it is checking that each call site READS them.
 */
const read = (rel: string) => readFileSync(fromDashboard(rel), 'utf8');

const CALL_SITES = [
  'app/(tenant)/search/SearchClient.tsx',
  'app/(tenant)/components/NewVisitSheet.tsx',
  'app/(tenant)/customers/CustomersClient.tsx',
];

describe('worthSearching', () => {
  // BR-01, and the case a plain `length < MIN` gets wrong.
  it('an empty box is "everyone", not "too short"', () => {
    expect(worthSearching('')).toBe(true);
    expect(worthSearching('   ')).toBe(true);
  });

  it('one character is not worth a request', () => {
    expect(worthSearching('a')).toBe(false);
    expect(worthSearching(' a ')).toBe(false);
  });

  // AC-03 — short names are ordinary, and three would have made this false.
  it('two characters is, because "Om" is a name', () => {
    expect(worthSearching('Om')).toBe(true);
    expect(worthSearching('Jai')).toBe(true);
  });
});

describe('the thresholds live in one place', () => {
  it('is two characters and a 350ms pause', () => {
    expect(SEARCH_MIN_CHARS).toBe(2);
    expect(SEARCH_DEBOUNCE_MS).toBe(350);
  });

  it('every search imports them rather than writing a number of its own', () => {
    for (const site of CALL_SITES) {
      const source = read(site);
      expect(source, `${site} imports the shared tuning`).toMatch(/from '\.\.\/lib\/search-tuning'/);
      /*
       * The literals these replaced. A re-introduced one is the drift this test
       * exists for — but both patterns are deliberately narrow, because a
       * broader one is a test that cries wolf: `length < 2` also appears in
       * NewVisitSheet as "does this business have more than one branch", which
       * has nothing to do with searching.
       */
      expect(source, `${site} has no hand-written debounce`).not.toMatch(/\},\s*\d+\s*\);/);
      expect(source, `${site} has no hand-written minimum`).not.toMatch(
        /\b(term|search|query)(\.trim\(\))?\.length\s*[<>]=?\s*\d/,
      );
    }
  });

  /*
   * Service search is deliberately NOT on this list: its spelling match never
   * leaves the browser, and its meaning match has its own measured floor. If a
   * future change points it here, that is a decision to make on purpose.
   */
  it('leaves service search on its own floors', () => {
    const suggest = read('app/(tenant)/lib/service-suggest.ts');
    expect(suggest).toMatch(/SUGGEST_MIN_CHARS = 4/);
    expect(suggest).not.toMatch(/search-tuning/);
  });
});
