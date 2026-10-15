import { describe, expect, it } from 'vitest';
import { isActive, resolveNav, type NavGroup } from './nav-sections';
import { canSee } from './nav-policy';

const groups: NavGroup<string>[] = [
  { href: '/', label: 'Home' },
  { href: '/appointments', label: 'Bookings', children: [{ href: '/availability', label: 'Free times' }] },
  {
    href: '',
    label: 'Catalogue',
    children: [
      { href: '/services', label: 'Services' },
      { href: '/packages', label: 'Packages' },
      { href: '/products', label: 'Products' },
    ],
  },
  { href: '', label: 'Team', children: [{ href: '/providers', label: 'Staff' }, { href: '/attendance', label: 'Attendance' }] },
];

describe('the grouped sidebar (owner, 2026-10-15)', () => {
  it('a group with no screen of its own opens at its first child the role may reach', () => {
    const rows = resolveNav(groups, (h) => h !== '/services');
    const catalogue = rows.find((r) => r.label === 'Catalogue')!;
    expect(catalogue.href).toBe('/packages');
    expect(catalogue.children.map((c) => c.href)).toEqual(['/packages', '/products']);
    expect(catalogue.self).toBe(false);
  });

  it('a group the role may reach none of is not drawn', () => {
    const rows = resolveNav(groups, (h) => h === '/' || h === '/appointments');
    expect(rows.map((r) => r.label)).toEqual(['Home', 'Bookings']);
  });

  it('a group that is a screen keeps its own route and lists itself; its children are extra', () => {
    const rows = resolveNav(groups, () => true);
    const bookings = rows.find((r) => r.label === 'Bookings')!;
    expect(bookings.href).toBe('/appointments');
    expect(bookings.self).toBe(true);
    expect(bookings.routes).toEqual(['/appointments', '/availability']);
  });

  it('a row is current on any of its routes, and Home only on /', () => {
    expect(isActive('/services/anything', '/services')).toBe(true);
    expect(isActive('/servicesx', '/services')).toBe(false);
    expect(isActive('/products', '/')).toBe(false);
    expect(isActive('/', '/')).toBe(true);
  });

  it('whatever the real policy says, every row opens a screen its role may see', () => {
    for (const role of ['owner', 'manager', 'receptionist', 'staff'] as const) {
      for (const row of resolveNav(groups, (h) => canSee(h, role, undefined, true))) {
        expect(canSee(row.href, role, undefined, true), `${role} → ${row.label}`).toBe(true);
        for (const c of row.children) expect(canSee(c.href, role, undefined, true), `${role} → ${c.label}`).toBe(true);
      }
    }
  });
});

describe('the sidebar folds (owner, 2026-10-15)', () => {
  const side = require('node:fs').readFileSync(require('node:path').join(__dirname, '../components/Sidebar.tsx'), 'utf8') as string;
  it('each group with children has its own fold button, named and wired to its panel', () => {
    expect(side).toMatch(/className=\{`nav-fold \$\{expanded \? 'is-open' : ''\}`\}/);
    expect(side).toMatch(/aria-expanded=\{expanded\}\s*aria-controls=\{panel\}/);
  });
  it('the person\'s choice is remembered on the device and survives a reload; arriving elsewhere in the group unfolds it', () => {
    expect(side).toMatch(/const FOLDS_KEY = 'growza_nav_folds';/);
    expect(side).toMatch(/folds\[item\.label\] \?\? current/);
    expect(side).toMatch(/if \(arrivedAt\.current === pathname\) return;/);
  });
});
