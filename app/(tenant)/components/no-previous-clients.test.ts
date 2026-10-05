import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-517 — New booking has no Previous clients list: the first screen is the search box and the
 * "Add someone new" block. (GRW-515 had cut the rows to names; the owner then asked for the section to go.)
 * A client is found by typing; nobody is offered before that, and the 20-client read that filled the list
 * is not made.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const copy = strip(readFileSync(resolve(__dirname, '../lib/use-copy.ts'), 'utf8'));

describe('New booking, first screen', () => {
  it('has no Previous clients heading, list or loading state', () => {
    expect(sheet).not.toMatch(/recentCustomers|loadingCustomers|noCustomersYet/);
    expect(sheet).not.toMatch(/setRecent|\brecent\b/);
  });

  it('makes no request for recent clients', () => {
    expect(sheet).not.toMatch(/limit: 20/);
  });

  it('still searches, and still offers the add block', () => {
    expect(sheet).toMatch(/results\.map\(\(c\) => \(/);
    expect(sheet).toMatch(/className="wi-new-person"/);
    expect(sheet).toMatch(/clientMetaLine\(c\)/);
  });

  it('its three strings are gone from the copy and from both languages', () => {
    expect(copy).not.toMatch(/recentCustomers|loadingCustomers|noCustomersYet/);
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(resolve(__dirname, `../../../messages/${lang}.json`), 'utf8')) as {
        services: Record<string, string>;
      };
      const all = JSON.stringify(m);
      expect(all).not.toMatch(/"recentCustomers"|"loadingCustomers"|"noCustomersYet"/);
    }
  });
});
