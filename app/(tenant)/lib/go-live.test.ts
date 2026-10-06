import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { isLive, isSetupDestination } from './go-live';
import { canSee, visibleItems } from './nav-policy';
import { setupHref } from './setup-copy';
import { SessionProvider, useLive } from '../components/SessionProvider';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/' }));

/**
 * Jira GRW-556 — until a business is live the dashboard is a setup tool: Home, Services, Staff, Settings, and the
 * menu that lists them. The API refuses every other write; this is the half that stops the dashboard offering it.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const tenant = path.resolve(here, '..');
const read = (p: string) => readFileSync(path.resolve(tenant, p), 'utf-8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('which destinations are setup ones', () => {
  it('Home, Services, Staff, Settings and the menu — and what is below them', () => {
    for (const href of ['/', '/services', '/providers', '/settings', '/more', '/settings/working-hours', '/providers/abc', '/services?x=1', '/not-live-yet']) {
      expect(isSetupDestination(href), href).toBe(true);
    }
  });

  it('everything else is closed', () => {
    for (const href of ['/appointments', '/appointments/new', '/customers', '/offers', '/packages', '/reports', '/attendance', '/availability', '/notifications', '/search', '/try-whatsapp']) {
      expect(isSetupDestination(href), href).toBe(false);
    }
  });

  it('a lookalike prefix is not a setup destination', () => {
    expect(isSetupDestination('/services-archive')).toBe(false);
    expect(isSetupDestination('/settingsx')).toBe(false);
  });

  it('every place the setup banner sends an owner is open (BR-03)', () => {
    for (const key of ['services', 'providers', 'salon_hours', 'working_hours', 'branch:abc']) {
      expect(isSetupDestination(setupHref(key)!), key).toBe(true);
    }
  });
});

describe('is the business live', () => {
  it('only a business /me calls provisioning is not — a failed or older /me reads as live', () => {
    expect(isLive('provisioning')).toBe(false);
    for (const s of ['active', 'suspended', 'churned', undefined, null, '']) expect(isLive(s), String(s)).toBe(true);
  });
});

describe('the nav chokepoint', () => {
  const items = ['/', '/appointments', '/customers', '/providers', '/services', '/offers', '/settings', '/reports'].map((href) => ({ href }));

  it('a live business keeps every destination its role may see', () => {
    expect(visibleItems(items, 'owner', undefined, true).map((i) => i.href)).toEqual(items.map((i) => i.href));
    expect(visibleItems(items, 'owner').map((i) => i.href)).toEqual(items.map((i) => i.href));
  });

  it('a business being set up offers four, for the owner', () => {
    expect(visibleItems(items, 'owner', undefined, false).map((i) => i.href)).toEqual(['/', '/providers', '/services', '/settings']);
  });

  it('and never more than the role could see anyway', () => {
    expect(visibleItems(items, 'receptionist', undefined, false).map((i) => i.href)).toEqual(['/']);
    expect(canSee('/offers', 'owner', undefined, false)).toBe(false);
    expect(canSee('/offers', 'owner', undefined, true)).toBe(true);
    expect(canSee('/settings', 'owner', undefined, false)).toBe(true);
  });
});

describe('the session carries it', () => {
  const probe = () => createElement('span', null, String(useLive()));
  const render = (live?: boolean) =>
    renderToStaticMarkup(createElement(SessionProvider, { session: { initial: 'S', role: 'owner', phone: null, businessName: 'S', ...(live === undefined ? {} : { live }) }, children: createElement(probe) }));

  it('false while being set up, true otherwise, and true when nothing says', () => {
    expect(render(false)).toContain('false');
    expect(render(true)).toContain('true');
    expect(render()).toContain('true');
  });
});

describe('every screen that opens at go-live is guarded — a new screen cannot be forgotten', () => {
  const screens = readdirSync(tenant)
    .filter((d) => !['components', 'lib', 'styles'].includes(d) && statSync(path.join(tenant, d)).isDirectory() && existsSync(path.join(tenant, d, 'page.tsx')))
    .filter((d) => !isSetupDestination(`/${d}`));

  it('there are screens to check', () => {
    expect(screens.length).toBeGreaterThanOrEqual(10);
  });

  for (const dir of ['appointments', 'attendance', 'availability', 'customers', 'notifications', 'offers', 'packages', 'reports', 'search', 'try-whatsapp']) {
    it(`/${dir} is closed until go-live`, () => {
      expect(screens).toContain(dir);
    });
  }

  it('each of them asks guardScreen or guardLive before it draws', () => {
    const unguarded = screens.filter((d) => {
      const files = [`${d}/page.tsx`, `${d}/layout.tsx`].filter((f) => existsSync(path.join(tenant, f)));
      return !files.some((f) => /await guard(Screen|Live)\(/.test(code(f)));
    });
    expect(unguarded).toEqual([]);
  });

  it('New booking, which sits below Bookings, is guarded too', () => {
    expect(code('appointments/new/page.tsx')).toMatch(/await guardLive\('\/appointments\/new'\)/);
  });

  it('the screens setup uses are not guarded away', () => {
    for (const d of ['services', 'providers', 'settings']) {
      expect(isSetupDestination(`/${d}`), d).toBe(true);
      const guarded = [`${d}/page.tsx`, `${d}/layout.tsx`].filter((f) => existsSync(path.join(tenant, f))).map(code).join('\n');
      expect(guarded, d).not.toMatch(/guardLive\(/);
    }
  });
});

describe('every surface that offers a destination follows the flag', () => {
  it('layout reads the status and hands it to the session', () => {
    const layout = code('layout.tsx');
    expect(layout).toMatch(/live = isLive\(me\.tenant\?\.status\);/);
    expect(layout).toMatch(/\blive,\n\s*\}\}/);
  });

  it('the sidebar, the tab bar and the More menu ask with the flag', () => {
    expect(code('components/Sidebar.tsx')).toMatch(/visibleItems\(items, role, reportTabs, live\)/);
    expect(code('components/BottomNav.tsx')).toMatch(/visibleItems\(items, role, reportTabs, live\)/);
    expect(code('more/page.tsx')).toMatch(/visibleItems\(items, role, reportTabs, live\)/);
  });

  it('the tab bar is Home, Services, Staff and Settings while being set up', () => {
    const bar = code('components/BottomNav.tsx');
    expect(bar).toMatch(/const items = !live\s*\?\s*\[[^\]]*'\/services'[^\]]*'\/providers'[^\]]*'\/settings'/s);
  });

  it('there is no floating "+", no search and no bell until it is live', () => {
    expect(code('components/MobileChrome.tsx')).toMatch(/mayBook && live && PLUS_ROUTE_RE\.test\(pathname\)/);
    expect(code('components/HeaderSearch.tsx')).toMatch(/!mayUseSearch \|\| !live/);
    expect(code('components/HeaderControls.tsx')).toMatch(/\{live \? <NotificationBell \/> : null\}/);
    expect(code('components/home/parts.tsx')).toMatch(/\{live \? <NotificationBell \/> : null\}/);
  });

  it('Home: the owner gets quick links only, the others get a plain sentence', () => {
    const home = code('components/home/OwnerHome.tsx');
    expect(home).toMatch(/canSee\(l\.href, p\.role, p\.reportTabs, live\)/);
    expect(home).toMatch(/if \(!live\) \{\s*return \(/);
    expect(code('page.tsx')).toMatch(/!isLive\(me\.tenant\?\.status\) && kind !== 'owner'/);
  });

  it("the staff Home is a client component — HomeHeader takes the copy's functions, which a server component cannot pass", () => {
    expect(read('components/home/NotLiveHome.tsx')).toMatch(/^'use client';/);
  });

  it('a closed address lands on a page that says so, and that page is open', () => {
    expect(code('lib/screen-guard.ts')).toMatch(/NOT_LIVE_PATH = '\/not-live-yet'/);
    expect(isSetupDestination('/not-live-yet')).toBe(true);
    expect(code('not-live-yet/page.tsx')).toMatch(/isLive\(\(await api\.me\(\)\)\.tenant\?\.status\)\) redirect\('\/'\)/);
  });
});
