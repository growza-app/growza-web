import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canSee, gridCanChange, gridCanSee, PAGE_OF_HREF } from './nav-policy';
import { areasOf, DIARY_AREAS, type PageGrid } from './areas';

/**
 * Jira GRW-74 — the dashboard offers a member who holds a role what the role grants, and nothing is asked of the fixed role they work like.
 * This is the courtesy half (the API is the boundary, `grid-enforcement.integration.test.ts`): a link a role cannot open is absent, not greyed.
 */
const SHOP = { ...DIARY_AREAS, bookings: false, services: false, shop: true };
const withGrid = (pages: PageGrid) => ({ ...SHOP, pages });
const DESK: PageGrid = { bookings: 'manage', clients: 'manage', services: 'manage', attendance: 'view' };
const STAFF: PageGrid = { attendance: 'view' };

describe('the nav follows the role’s pages', () => {
  it('a Desk role is offered Clients and Stock, and not Orders (the money is Reports’), Reports, Settings or Offers', () => {
    const areas = withGrid(DESK);
    expect(canSee('/orders', 'receptionist', undefined, true, areas)).toBe(false);
    expect(canSee('/orders', 'receptionist', undefined, true, withGrid({ ...DESK, reports: 'view' }))).toBe(true);
    expect(canSee('/customers', 'receptionist', undefined, true, areas)).toBe(true);
    expect(canSee('/stock', 'receptionist', undefined, true, areas)).toBe(true);
    expect(canSee('/reports', 'receptionist', undefined, true, areas)).toBe(false);
    expect(canSee('/settings', 'receptionist', undefined, true, areas)).toBe(false);
  });

  it('a page at None is absent, at See or Change is present', () => {
    expect(gridCanSee('/reports', { reports: 'none' })).toBe(false);
    expect(gridCanSee('/reports', { reports: 'view' })).toBe(true);
    expect(gridCanSee('/reports', { reports: 'manage' })).toBe(true);
    expect(gridCanSee('/reports', {})).toBe(false);
  });

  it('a Staff role (attendance only) still has Home, the menu, notifications and help', () => {
    const areas = withGrid(STAFF);
    for (const href of ['/', '/more', '/help']) expect(canSee(href, 'staff', undefined, true, areas), href).toBe(true);
    expect(canSee('/orders', 'staff', undefined, true, areas)).toBe(false);
  });

  it('a manager-like role is offered by the grid too, not by the owner-like default', () => {
    expect(canSee('/reports', 'manager', undefined, true, withGrid({ reports: 'none', settings: 'manage' }))).toBe(false);
    expect(canSee('/settings', 'manager', undefined, true, withGrid({ settings: 'manage' }))).toBe(true);
  });

  it('a sub-screen follows its page, the till needs the shelf too, and the owner-only settings never open', () => {
    expect(gridCanSee('/settings/profile', { settings: 'view' })).toBe(true);
    for (const href of ['/settings/billing', '/settings/branches', '/settings/team', '/settings/roles']) expect(gridCanSee(href, { settings: 'manage' }), href).toBe(false);
    expect(gridCanSee('/products/sell', { bookings: 'manage' })).toBe(false);
    expect(gridCanSee('/products/sell', { bookings: 'manage', services: 'view' })).toBe(true);
    expect(gridCanSee('/products', { bookings: 'manage' })).toBe(false);
    expect(gridCanSee('/search', { bookings: 'view' })).toBe(true);
    expect(gridCanSee('/search', { clients: 'manage' })).toBe(false);
    expect(gridCanSee('/notifications', {})).toBe(false);
    expect(gridCanSee('/try-whatsapp', { attendance: 'view' })).toBe(false);
  });

  it('the business still has to be live: a role does not open a setup-only business', () => {
    expect(canSee('/orders', 'receptionist', undefined, false, withGrid(DESK))).toBe(false);
  });
});

describe('who gets a grid at all', () => {
  const me = (member: { role: string; tenantRoleId?: string | null } | null) => ({ surface: 'shop', member, permissions: DESK });
  it('a member who holds a role does', () => {
    expect(areasOf(me({ role: 'receptionist', tenantRoleId: 'r1' })).pages).toEqual(DESK);
  });
  it('the owner never does, even with a role id', () => {
    expect(areasOf(me({ role: 'owner', tenantRoleId: 'r1' })).pages).toBeUndefined();
  });
  it('a member with no role does not: they are offered what their fixed role always was', () => {
    expect(areasOf(me({ role: 'receptionist', tenantRoleId: null })).pages).toBeUndefined();
    expect(canSee('/orders', 'receptionist', ['sales'], true, areasOf(me({ role: 'receptionist', tenantRoleId: null })))).toBe(true);
  });
  it('a degraded session with no member does not', () => {
    expect(areasOf(me(null)).pages).toBeUndefined();
  });
});

describe('the direct address', () => {
  it('the screen guard sends a page the role does not open Home, before any data is asked for', () => {
    const guard = readFileSync(join(__dirname, 'screen-guard.ts'), 'utf8');
    expect(guard).toContain("if (areas.pages && !gridCanSee(href, areas.pages)) redirect('/');");
    // guardScreen asks canSee with the same areas object, which carries the grid.
    expect(guard).toContain('canSee(href, role, reportTabs, true, areas)');
  });
});

describe('the local page map stays honest about the screens there are', () => {
  const root = join(__dirname, '..');
  const screens = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'page.tsx')))
    .map((d) => `/${d.name}`);
  // Open to every member by design: the menu, help, the page that says a business is being set up, and the catch-all 404.
  const OPEN_TO_ALL = ['/more', '/help', '/not-live-yet', '/[...rest]'];

  it('walked the screens (a walk that found nothing would pass everything)', () => {
    expect(screens.length).toBeGreaterThan(15);
  });

  it('every screen belongs to a page of the grid or is open to all on purpose — a new screen fails here, naming itself', () => {
    const mapped = new Set(PAGE_OF_HREF.map(([prefix]) => prefix));
    const loose = screens.filter((s) => !mapped.has(s) && !OPEN_TO_ALL.includes(s));
    expect(loose, `screen(s) with no page in PAGE_OF_HREF (lib/nav-policy.ts): ${loose.join(', ')} — say which page of the role grid each belongs to, or add it to OPEN_TO_ALL here`).toEqual([]);
  });

  it('every mapped address is a screen that exists', () => {
    // A mapped address is a directory of screens (`/documents` holds only `[id]`), so the directory is what has to exist.
    const missing = PAGE_OF_HREF.map(([prefix]) => prefix).filter((p) => !existsSync(join(root, ...p.slice(1).split('/'))));
    expect(missing).toEqual([]);
  });
});

describe('Settings follows the role’s pages too', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('the hub lists a row only if the role opens its address', () => {
    expect(read('settings/SettingsNavList.tsx')).toContain('(!areas.pages || !row.href || gridCanSee(row.href, areas.pages))');
  });
  it('each owner-only screen sends a role holder Home by its own address, before any data is asked for', () => {
    for (const [file, href] of [['settings/billing/page.tsx', '/settings/billing'], ['settings/billing/bills/page.tsx', '/settings/billing'], ['settings/billing/bills/[id]/page.tsx', '/settings/billing'], ['settings/branches/page.tsx', '/settings/branches']] as const) {
      const src = read(file);
      expect(src, file).toContain(`await guardScreen('${href}');`);
      expect(src.indexOf('guardScreen('), file).toBeLessThan(src.search(/\bapi\.\w+\(/));
    }
  });
});

describe('Jira GRW-76 — a page held at See is read-only, and a write-only screen needs Change', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('a screen of a page at See cannot be changed; at Change it can; one belonging to no page is not the grid’s to limit', () => {
    expect(gridCanChange('/customers', { clients: 'view' })).toBe(false);
    expect(gridCanChange('/customers', { clients: 'manage' })).toBe(true);
    expect(gridCanChange('/stock', { services: 'view' })).toBe(false);
    expect(gridCanChange('/', {})).toBe(true);
    expect(gridCanChange('/more', { clients: 'view' })).toBe(true);
  });

  it('the till, a new booking and Try WhatsApp are not offered at See: there is no read-only version of any of them', () => {
    for (const href of ['/products/sell', '/appointments/new', '/try-whatsapp']) {
      expect(gridCanSee(href, { bookings: 'view', services: 'view' }), `${href} at See`).toBe(false);
      expect(gridCanSee(href, { bookings: 'manage', services: 'manage' }), `${href} at Change`).toBe(true);
    }
  });

  it('the layout mounts ScreenAccess, and useWritable reads it (not usePathname itself, which two dozen components would then need a router for)', () => {
    expect(read('layout.tsx')).toContain('<ScreenAccess>');
    const provider = read('components/SessionProvider.tsx');
    expect(provider).toContain('useContext(ScreenWritableContext)');
    const body = provider.slice(provider.indexOf('export function useWritable'));
    expect(body.slice(0, body.indexOf('\n}')), 'useWritable').not.toContain('usePathname');
  });

  it('the Settings Save bars are undrawn on a read-only screen', () => {
    expect(read('settings/SettingsSaveBar.tsx')).toContain('if (!useWritable()) return null;');
    expect(read('settings/profile/ProfileForm.tsx')).toContain('{writable ? (');
  });

  it('the Roles screen sends a role holder Home by its address, and no longer says the grid is "kept for when it takes over"', () => {
    expect(read('settings/roles/page.tsx')).toContain("await guardScreen('/settings/roles');");
    const en = JSON.parse(readFileSync(join(__dirname, '../../../messages/en.json'), 'utf8')).settingsRoles;
    expect(en.todayNote).not.toMatch(/takes over|Today/);
    expect(en.worksLikeHint).not.toMatch(/Today/);
  });
});

describe('Jira GRW-76 — a sheet that rises stays centred on a laptop', () => {
  it('the rise animation carries the centring, so it cannot replace it', () => {
    const css = readFileSync(join(__dirname, '../styles/98-service-sheet.css'), 'utf8');
    expect(css).toMatch(/\.sheet-backdrop \+ \.sheet\.sheet-rise \{\s*animation-name: sheet-fade-up-centred;/);
    expect(css).toMatch(/@keyframes sheet-fade-up-centred \{[\s\S]*?translate\(-50%, -50%\)/);
  });
});

describe('Jira GRW-76 review — the screen-level rule reaches every control, and the till is judged by its own pages', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('useMayUse counts the screen too, so Record payment and Return product are not drawn on Orders at See', () => {
    const provider = read('components/SessionProvider.tsx');
    const body = provider.slice(provider.indexOf('export function useMayUse'));
    expect(body.slice(0, body.indexOf('\n}'))).toContain('const writable = useWritable();');
  });

  it('the floating plus belongs to Bookings, so it asks the business and not the screen (it is drawn on Customers at Bookings Change)', () => {
    const chrome = read('components/MobileChrome.tsx');
    expect(chrome).toContain('const writable = useBusinessWritable();');
    expect(chrome).not.toMatch(/const writable = useWritable\(\)/);
  });

  it('an address with a query string is judged by its path', () => {
    expect(gridCanSee('/appointments/new?mode=now', { bookings: 'view' })).toBe(false);
    expect(gridCanSee('/appointments/new?mode=now', { bookings: 'manage' })).toBe(true);
    expect(gridCanSee('/reports?range=week', { reports: 'none' })).toBe(false);
  });
});
