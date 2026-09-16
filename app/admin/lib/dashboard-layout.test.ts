import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-287 — the admin Home QA defects that live in markup and CSS
 * rather than in a function.
 *
 * Read from source, like the tenant plane's walk-in-opens-now test: these are
 * client components with no DOM in this environment, and each defect came down
 * to one line that can be pinned. The rendered sizes themselves belong to
 * `npm run test:devices`; what these guard is the structure that makes those
 * sizes come out right.
 */
const here = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');
const page = here('../page.tsx');
const skeleton = here('../components/DashboardSkeleton.tsx');
const parts = here('../components/DashboardParts.tsx');
const bell = here('../components/NotificationBell.tsx');
const css = here('../admin.css');

describe('Bookings and Business status sit 16px apart on a laptop (QA D3)', () => {
  it('are one grid item, not two rows the attention list can stretch', () => {
    expect(css).toMatch(/'attention side'/);
    expect(css).not.toMatch(/'attention bookings'/);
    expect(css).not.toMatch(/'attention status'/);
    expect(page).toMatch(/<div className="admin-dash-side">\s*<BookingsCard/);
  });
});

describe('the loading skeleton has the loaded page’s shape (QA D6)', () => {
  it('uses every grid area the loaded page places a card in', () => {
    const areas = new Set([...page.matchAll(/className="(admin-dash-[a-z]+)"/g)].map((m) => m[1]));
    expect(areas.size).toBeGreaterThanOrEqual(5);
    for (const area of areas) expect(skeleton).toContain(`className="${area}"`);
    expect(skeleton).toContain('className="admin-stat-grid"');
  });

  it('draws the Bookings card GRW-280 added, and draws revenue in the real card’s frame', () => {
    expect(skeleton).toMatch(/title="Bookings"/);
    // The loaded RevenueCard's 92px chart row, not a 120px guess inside a 20px-padded Card.
    expect(skeleton).toMatch(/height: 92, marginTop: 14/);
    expect(parts).toMatch(/height: 92, marginTop: 14/);
    expect(page).toMatch(/if \(loading \|\| !data\) return <DashboardSkeleton \/>;/);
  });
});

describe('empty platform copy (QA D6)', () => {
  it('is one shared sentence, used by Business status and Bookings alike', () => {
    expect(parts).toMatch(/platformEmpty \? PLATFORM_EMPTY_COPY/);
    expect(page).toMatch(/\{PLATFORM_EMPTY_COPY\}/);
    expect(page).toMatch(/platformEmpty=\{empty\}/);
    expect(parts).not.toContain('No bookings made yet this month.');
  });
});

describe('the notification bell (QA of GRW-276)', () => {
  it('re-reads on every route change and every time the panel opens', () => {
    expect(bell).toMatch(/\}, \[pathname, openCount\]\);/);
    expect(bell).toMatch(/if \(!open\) setOpenCount\(\(n\) => n \+ 1\)/);
  });

  it('closes on Escape and hands focus back to the bell', () => {
    expect(bell).toMatch(/event\.key !== 'Escape'/);
    expect(bell).toMatch(/setOpen\(false\);\s*buttonRef\.current\?\.focus\(\);/);
    expect(bell).toMatch(/ref=\{buttonRef\}/);
  });
});
