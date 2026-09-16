import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOTTOM_NAV, NAV_GROUPS, bottomNavItems } from '../nav';

/**
 * Jira GRW-267 · GRW-272 — the admin portal on a phone.
 *
 * A bottom bar the owner chose (Home · Businesses · Subscriptions · Invoices ·
 * More), and tables that become cards. The layout itself is checked in a real
 * browser across the device matrix; these pin the parts a refactor could
 * quietly undo.
 */
const admin = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');
const ALL = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.permission));

describe('the bottom bar', () => {
  it('AC-01 — Home, Businesses, Subscriptions, Invoices, in that order, for an admin who may open all four', () => {
    expect(bottomNavItems(ALL, false).map((t) => t.short)).toEqual(['Home', 'Businesses', 'Subscriptions', 'Invoices']);
    expect(bottomNavItems(ALL, false).map((t) => t.href)).toEqual(BOTTOM_NAV.map((t) => t.href));
  });

  it('every tab is a real sidebar screen, so it carries the sidebar’s icon and permission', () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    for (const tab of BOTTOM_NAV) expect(hrefs, tab.href).toContain(tab.href);
  });

  it('AC-03 — a tab the admin may not open is not offered', () => {
    const noInvoices = ALL.filter((p) => p !== 'admin.invoice.view');
    expect(bottomNavItems(noInvoices, false).map((t) => t.short)).toEqual(['Home', 'Businesses', 'Subscriptions']);
    expect(bottomNavItems([], false)).toEqual([]);
  });

  it('boundary: /me not answered yet offers nothing; /me failed offers all, like the sidebar', () => {
    expect(bottomNavItems(null, false)).toEqual([]);
    expect(bottomNavItems(null, true)).toHaveLength(4);
  });

  it('the shell renders it, with More opening the full menu, and no hamburger left', () => {
    const shell = admin('components/AdminShell.tsx');
    expect(shell).toMatch(/className="admin-bottom-nav bottom-nav"/);
    expect(shell).toMatch(/onClick=\{\(\) => setNavOpen\(true\)\}[\s\S]{0,200}More/);
    expect(shell).not.toMatch(/aria-label="Open navigation"/);
  });

  it('is phone-only: hidden by default, shown at ≤860px', () => {
    const css = admin('admin.css');
    expect(css).toMatch(/\.admin-bottom-nav \{\s*display: none;/);
    const phone = css.slice(css.indexOf('GRW-267 · GRW-272'));
    expect(phone).toMatch(/@media \(max-width: 860px\)[\s\S]*\.admin-bottom-nav \{\s*display: grid;/);
  });
});

describe('tables become cards on a phone', () => {
  it('every cell is labelled from its column, and a column can opt out of the card', () => {
    const primitives = admin('components/primitives.tsx');
    expect(primitives).toMatch(/className="admin-cell"/);
    expect(primitives).toMatch(/data-label=\{column\?\.label \|\| undefined\}/);
    expect(primitives).toMatch(/data-mobile=\{column\?\.mobile === false \? 'hide' : undefined\}/);
  });

  it('the phone stylesheet drops the heading row and the table’s minimum width', () => {
    const css = admin('admin.css');
    expect(css).toMatch(/\.admin-table-head \{\s*display: none !important;/);
    expect(css).toMatch(/\.admin-table-inner \{\s*min-width: 0 !important;/);
    expect(css).toMatch(/\.admin-cell\[data-label\]:not\(\[data-first='true'\]\)::before \{\s*content: attr\(data-label\);/);
  });
});

describe('nothing wider than a 320px phone', () => {
  it('no fixed grid minimum can exceed the screen', () => {
    const hits = execSync(`grep -rn "minmax([0-9]*px, 1fr)" app/admin || true`, { cwd: resolve(__dirname, '../../..'), encoding: 'utf8' });
    expect(hits.trim()).toBe('');
  });
});
