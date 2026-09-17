import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOTTOM_NAV, BROWSER_BACK, NAV_GROUPS, bottomNavItems, resolveRouteMeta } from '../nav';

/**
 * Jira GRW-267 · GRW-272 — the admin portal on a phone.
 *
 * A bottom bar the owner chose (Home · Businesses · Subscriptions · Invoices),
 * and tables that become cards. "More" was originally this bar's fifth tab;
 * Jira GRW-298 moved it to the header, beside the heading, instead, and
 * GRW-299 put Notifications in that freed slot — its own full page rather
 * than the header bell's popover, with a back button rather than a
 * dismiss-on-outside-click panel. The layout itself is checked in a real
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

  // Jira GRW-298 — "More" moved off this bar into the header, beside the
  // heading, so it no longer competes with the four real screens for a tab
  // slot. Pinned here rather than left to the browser-only device matrix
  // because a refactor moving it back (or dropping it entirely) would not
  // fail typecheck, lint or any other test.
  it('"More" opens the same menu from the header now, not from a bottom-bar tab', () => {
    const shell = admin('components/AdminShell.tsx');
    expect(shell).toMatch(/className="admin-bottom-nav bottom-nav"/);

    const headerBlock = shell.slice(shell.indexOf('<header'), shell.indexOf('</header>'));
    expect(headerBlock).toMatch(/onClick=\{\(\) => setNavOpen\(true\)\}[\s\S]{0,200}aria-label="More"/);

    const bottomNavBlock = shell.slice(shell.indexOf('<nav className="admin-bottom-nav'), shell.lastIndexOf('</nav>'));
    expect(bottomNavBlock).not.toMatch(/More/);
    expect(shell).not.toMatch(/aria-label="Open navigation"/);
  });

  it('is phone-only: hidden by default, shown at ≤860px', () => {
    const css = admin('admin.css');
    expect(css).toMatch(/\.admin-bottom-nav \{\s*display: none;/);
    const phone = css.slice(css.indexOf('GRW-267 · GRW-272'));
    expect(phone).toMatch(/@media \(max-width: 860px\)[\s\S]*\.admin-bottom-nav \{\s*display: grid;/);
  });
});

describe('Notifications, admin mobile only (Jira GRW-299)', () => {
  it('resolveRouteMeta gives it a browser-back button, not a fixed parent link', () => {
    // Every OTHER back link is a fixed parent screen, right for a page reached
    // from one place. This one is reached from wherever the bottom tab is
    // tapped, so it has no single fixed parent — see BROWSER_BACK's own note.
    expect(resolveRouteMeta('/admin/notifications')).toMatchObject({ title: 'Notifications', back: { href: BROWSER_BACK, label: 'Back' } });
  });

  it('the header back button resolves the sentinel to router.back(), everything else to router.push()', () => {
    const shell = admin('components/AdminShell.tsx');
    expect(shell).toMatch(/meta\.back!\.href === BROWSER_BACK \? router\.back\(\) : router\.push\(meta\.back!\.href\)/);
  });

  it('is its own bottom-bar tab — the slot "More" left behind — not one of the four looked up from NAV_GROUPS', () => {
    const shell = admin('components/AdminShell.tsx');
    const bottomNavBlock = shell.slice(shell.indexOf('<nav className="admin-bottom-nav'), shell.lastIndexOf('</nav>'));
    expect(bottomNavBlock).toMatch(/href="\/admin\/notifications"/);
    expect(bottomNavBlock).toMatch(/Notifications/);
    // Not a sidebar screen — there is no NAV_GROUPS entry for it to leak into the desktop sidebar.
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href === '/admin/notifications')).toBe(false);
  });

  it('slides in from the right; every other route keeps the plain fade', () => {
    const shell = admin('components/AdminShell.tsx');
    expect(shell).toMatch(/pathname === '\/admin\/notifications' \? 'admin-slide-in-right 0\.25s ease' : 'admin-fade 0\.25s ease'/);
    const css = admin('admin.css');
    expect(css).toMatch(/@keyframes admin-slide-in-right/);
  });

  it('replaces the header bell on a phone instead of sitting beside it as a second way in', () => {
    const css = admin('admin.css');
    const phone = css.slice(css.indexOf('GRW-267 · GRW-272'));
    expect(phone).toMatch(/@media \(max-width: 860px\)[\s\S]*\.admin-header-bell \{\s*display: none !important;/);
  });

  // Jira GRW-300 — Notifications has a back button (its own meta.back), which
  // used to sit ABOVE the header's hamburger rather than replacing it: two
  // different ways to leave the same screen. Any other back-having screen
  // (Business detail, Plan edit…) gets the identical fix, since the
  // conflict is the same one everywhere a back button exists.
  it('hides the header hamburger on any screen that already has a back button', () => {
    const shell = admin('components/AdminShell.tsx');
    expect(shell).toMatch(/\{!meta\.back \? \(\s*<button\s*type="button"\s*className="admin-mobile-only"\s*onClick=\{\(\) => setNavOpen\(true\)\}/);
  });

  // Jira GRW-300 (follow-up) — specifically Notifications' own back button:
  // icon-only, inline with the H1 in the hamburger's slot, not the
  // text-and-chevron line every OTHER back-having screen still uses above
  // its title. Scoped to this one route, not a rule about back buttons
  // generally — Business detail's "← Businesses" is unchanged.
  it('Notifications\' back button is icon-only and inline with the H1, not the text-above-title style other back screens use', () => {
    const shell = admin('components/AdminShell.tsx');
    expect(shell).toMatch(/meta\.back && pathname !== '\/admin\/notifications'/);
    expect(shell).toMatch(/meta\.back && pathname === '\/admin\/notifications'[\s\S]{0,400}aria-label=\{meta\.back\.label\}[\s\S]{0,600}<Icon name="chevronLeft" size=\{18\} \/>/);
  });
});

describe('tables become cards on a phone', () => {
  it('every cell is labelled from its column, and a column can opt out of the card', () => {
    const primitives = admin('components/primitives.tsx');
    expect(primitives).toMatch(/className="admin-cell"/);
    expect(primitives).toMatch(/data-label=\{column\?\.label \|\| undefined\}/);
    expect(primitives).toMatch(/data-mobile=\{column\?\.mobile === false \? 'hide' : undefined\}/);
  });

  it('the card stylesheet drops the heading row and the table’s minimum width', () => {
    // Jira GRW-288 — keyed on the measured `data-layout` rather than written
    // inside the 860px query, because a laptop table that does not fit needs
    // the same card. A phone is always `cards` (lib/table-layout.ts).
    const css = admin('admin.css');
    expect(css).toMatch(/\.admin-table\[data-layout='cards'\] \.admin-table-head \{\s*display: none;/);
    expect(css).toMatch(/\.admin-table\[data-layout='cards'\] \.admin-table-inner \{\s*min-width: 0;/);
    expect(css).toMatch(
      /\.admin-table\[data-layout='cards'\] \.admin-cell\[data-label\]:not\(\[data-first='true'\]\)::before \{\s*content: attr\(data-label\);/,
    );
  });
});

describe('nothing wider than a 320px phone', () => {
  it('no fixed grid minimum can exceed the screen', () => {
    const hits = execSync(`grep -rn "minmax([0-9]*px, 1fr)" app/admin || true`, { cwd: resolve(__dirname, '../../..'), encoding: 'utf8' });
    expect(hits.trim()).toBe('');
  });
});
