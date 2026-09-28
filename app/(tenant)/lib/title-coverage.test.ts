import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fromDashboard } from './dashboard-root';

/**
 * Jira GRW-192 — every screen names itself, and a new one cannot forget to.
 *
 * AC-02: *"a route added later must not silently inherit another screen's
 * name."* Next makes that easy to get wrong. A page with no `metadata` does not
 * fail — it quietly falls back to the layout's `title.default`, which is
 * exactly the "thirteen tabs, one name" state this ticket removes. The failure
 * mode is silence, so the guard has to be a test rather than a convention.
 *
 * It reads the route directory rather than a hand-written list, for the reason
 * GRW-215 learned the hard way: three screens (Attendance, Reports, Search)
 * shipped after a card said "all ten screens", and no list caught up with them.
 * A list of routes goes stale; a directory cannot.
 */

const ROUTES_DIR = fromDashboard('app/(tenant)');

function findPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findPages(full));
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

describe('every tenant screen names itself in the browser tab', () => {
  const pages = findPages(ROUTES_DIR);

  it('finds the routes at all', () => {
    // A guard that silently enumerates nothing passes forever. If this file is
    // ever moved and the path goes stale, this is what says so.
    expect(pages.length).toBeGreaterThan(15);
  });

  it('declares a title on every single one', () => {
    const missing = pages.filter((file) => {
      const src = readFileSync(file, 'utf8');
      return !/export const metadata\b/.test(src) && !/export (const|async function) generateMetadata\b/.test(src);
    });

    expect(
      missing,
      missing.length
        ? `\nThese routes declare no title, so their tab would read the business name and nothing else:\n` +
            missing.map((f) => `  ${f}`).join('\n') +
            `\n\nAdd one from lib/page-title.ts — screenTitle('Name') for a screen every vertical calls\n` +
            `the same thing, labelledTitle(key, fallback) for one a vertical renames.\n`
        : '',
    ).toEqual([]);
  });

  it('routes the vertical renames use the label, not a hard-coded English word', () => {
    /*
     * The four nouns `ctx.labels` owns. A clinic reads "Doctors", "Patients"
     * and "Visits" where a salon reads "Staff", "Clients" and "Bookings" — so a
     * static title on these screens would be right for salon and wrong for
     * every vertical after it, while the SIDEBAR beside it said the right
     * thing, because the nav already resolves these.
     */
    for (const route of ['appointments', 'providers', 'services', 'customers']) {
      const src = readFileSync(join(ROUTES_DIR, route, 'page.tsx'), 'utf8');
      expect(src, `${route} must take its title from ctx.labels`).toMatch(/labelledTitle\(/);
    }
  });

  it('the shell provides exactly one main landmark', () => {
    const layout = readFileSync(join(ROUTES_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/<main className="content-main">\{children\}<\/main>/);

    // And no page re-declares one inside it. Nested <main> is invalid, and Home
    // had the only one in the app before this ticket.
    const nested = findPages(ROUTES_DIR).filter((f) => /<main[\s>]/.test(readFileSync(f, 'utf8')));
    expect(nested, `these pages nest a <main> inside the shell's own`).toEqual([]);
  });
});
