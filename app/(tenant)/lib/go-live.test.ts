import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import { isLive, isSetupDestination } from './go-live';
import { canSee, visibleItems, type MemberRole } from './nav-policy';
import { setupHref } from './setup-copy';
import { SessionProvider, useLive } from '../components/SessionProvider';
import { NotLiveHome } from '../components/home/NotLiveHome';
import { MobileNavProvider } from '../components/MobileNavProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

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
  const Probe = () => createElement('span', null, String(useLive()));
  const render = (live?: boolean) =>
    renderToStaticMarkup(createElement(SessionProvider, { session: { initial: 'S', role: 'owner', phone: null, businessName: 'S', ...(live === undefined ? {} : { live }) }, children: createElement(Probe) }));

  it('false while being set up, true otherwise, and true when nothing says', () => {
    expect(render(false)).toContain('false');
    expect(render(true)).toContain('true');
    expect(render()).toContain('true');
  });
});

describe('every screen that opens at go-live is guarded — a new screen cannot be forgotten', () => {
  /**
   * EVERY page under a closed root, at any depth — not the top of each folder.
   *
   * This swept depth one and listed `appointments/new` by hand below, which is what a sweep that cannot reach a
   * nested page looks like from the inside: `attendance/[providerId]/page.tsx` drew a staff member's whole month
   * at a business that was not live, and this file passed. A route segment is a directory, so the walk is the
   * route tree; `[providerId]` and `(group)` segments carry no path of their own, which is why the href a page
   * guards with is read from the page rather than built from its folders.
   */
  const pagesUnder = (dir: string): string[] =>
    readdirSync(path.join(tenant, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? pagesUnder(path.join(dir, e.name)) : e.name === 'page.tsx' ? [path.join(dir, e.name)] : [],
    );

  const roots = readdirSync(tenant)
    .filter((d) => !['components', 'lib', 'styles'].includes(d) && statSync(path.join(tenant, d)).isDirectory())
    .filter((d) => !isSetupDestination(`/${d}`));
  const screens = roots.filter((d) => existsSync(path.join(tenant, d, 'page.tsx')));
  const pages = roots.flatMap(pagesUnder);

  it('there are screens to check, and more pages than screens', () => {
    expect(screens.length).toBeGreaterThanOrEqual(10);
    // If these are ever equal the walk has stopped descending, and the hole this test exists for is back.
    expect(pages.length).toBeGreaterThan(screens.length);
  });

  for (const dir of ['appointments', 'attendance', 'availability', 'customers', 'notifications', 'offers', 'packages', 'reports', 'search', 'try-whatsapp']) {
    it(`/${dir} is closed until go-live`, () => {
      expect(screens).toContain(dir);
    });
  }

  /**
   * What actually runs before a page draws: the page itself, and every `layout.tsx` ABOVE it.
   *
   * A parent `page.tsx` does not — `/appointments/page.tsx` never runs for `/appointments/new`, which is exactly
   * why New booking needed its own `guardLive` and why reading the parent's guard as cover would hand the hole
   * straight back.
   */
  const runsBefore = (page: string): string[] => {
    const out = [page];
    for (let dir = path.dirname(page); dir !== '.'; dir = path.dirname(dir)) {
      const layout = path.join(dir, 'layout.tsx');
      if (existsSync(path.join(tenant, layout))) out.push(layout);
    }
    return out;
  };

  it('every page below a closed screen asks guardScreen or guardLive before it draws', () => {
    const unguarded = pages.filter((f) => !runsBefore(f).some((p) => /await guard(Screen|Live)\(/.test(code(p))));
    expect(unguarded).toEqual([]);
  });

  it('the screens setup uses are not guarded away', () => {
    for (const d of ['services', 'providers', 'settings']) {
      expect(isSetupDestination(`/${d}`), d).toBe(true);
      const guarded = pagesUnder(d)
        .concat([`${d}/layout.tsx`].filter((f) => existsSync(path.join(tenant, f))))
        .map(code)
        .join('\n');
      expect(guarded, d).not.toMatch(/guardLive\(/);
    }
  });
});

describe('every surface that offers a destination follows the flag', () => {
  it('layout reads the status and hands it to the session', () => {
    const layout = code('layout.tsx');
    expect(layout).toMatch(/live = isLive\(me\.tenant\?\.status\);/);
    // `writable` and `walkIn` ride beside it (Jira GRW-556 follow-up), so `live` is no longer last.
    expect(layout).toMatch(/\blive,\n\s*writable,\n\s*walkIn,\n\s*\}\}/);
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

  it('a bar left with one tab is not drawn — a tab bar that navigates nowhere', () => {
    // Those four are the owner's. A receptionist or stylist may see none of them, and the role filter left them a
    // single full-width "Home" pointing at the screen they were already on.
    expect(visibleItems([{ href: '/' }, { href: '/services' }], 'receptionist', undefined, false)).toHaveLength(1);
    expect(code('components/BottomNav.tsx')).toMatch(/if \(visible\.length < 2 && !centre\) return null;/);
  });

  it('there is no floating "+", no search and no bell until it is live', () => {
    expect(code('components/MobileChrome.tsx')).toMatch(/mayBook && live && PLUS_ROUTE_RE\.test\(pathname\)/);
    expect(code('components/HeaderSearch.tsx')).toMatch(/!mayUseSearch \|\| !live/);
    expect(code('components/HeaderControls.tsx')).toMatch(/\{live \? <NotificationBell \/> : null\}/);
    expect(code('components/home/parts.tsx')).toMatch(/\{live \? <NotificationBell \/> : null\}/);
  });

  /*
   * Home is replaced BEFORE anything is read, for every role, and that ordering is the test.
   *
   * It was gated at the bottom of `OwnerHome` instead: the owner's eight server reads all ran, `OwnerHome`'s own
   * two re-ran in the browser, and then the component returned three links. Pinned here rather than left to a
   * reviewer, because the cheap version of this fix is the one that was written first.
   */
  it('Home is swapped for the setup Home before a single read, for every role', () => {
    const page = code('page.tsx');
    expect(page).toMatch(/if \(!isLive\(me\.tenant\?\.status\)\) \{\s*return \(\s*<NotLiveHome/);
    // Before the first read of the day: the role branches below all await something.
    expect(page.indexOf('<NotLiveHome')).toBeLessThan(page.indexOf('Promise.all'));
    expect(page).not.toMatch(/kind !== 'owner'/);
  });

  it("Home: the owner gets the setup links, the others a plain sentence — and OwnerHome no longer asks", () => {
    const notLive = code('components/home/NotLiveHome.tsx');
    expect(notLive).toMatch(/canSee\(l\.href, role, reportTabs, false\)/);
    expect(notLive).toMatch(/links\.length > 0 \?/);
    expect(notLive).toMatch(/c\.staffHome\}/);
    // The day's Home is only ever drawn for a live business now, so it has no flag to read.
    const home = code('components/home/OwnerHome.tsx');
    expect(home).not.toMatch(/useLive|!live/);
  });

  it("the setup Home is a client component — HomeHeader takes the copy's functions, which a server component cannot pass", () => {
    expect(read('components/home/NotLiveHome.tsx')).toMatch(/^'use client';/);
  });

  /*
   * Rendered, not grepped. The last two faults on this screen were both a render: a server component handing
   * `HomeHeader` the copy's functions ("Something went wrong"), and tiles drawn from a list nobody had filtered.
   * Neither is visible in the source of the component that breaks.
   */
  describe('the setup Home, drawn', () => {
    const draw = (role: MemberRole) =>
      renderToStaticMarkup(
        createElement(NextIntlClientProvider, {
          locale: 'en',
          messages: en,
          timeZone: 'Asia/Kolkata',
          children: createElement(
            MobileNavProvider,
            null,
            createElement(SessionProvider, {
              session: { initial: 'S', role, phone: null, businessName: 'Journey Salon', live: false },
              children: createElement(NotLiveHome, {
                lang: 'en' as const,
                labels: {},
                businessName: 'Journey Salon',
                dateLabel: 'Mon 6 Oct',
                greetingPart: 'morning' as const,
                locationName: null,
                role,
              }),
            }),
          ),
        }),
      );

    it('an owner gets the three places setup happens, and no day', () => {
      const html = draw('owner');
      for (const href of ['/providers', '/services', '/settings']) expect(html, href).toContain(`href="${href}"`);
      for (const href of ['/appointments', '/customers', '/offers', '/reports']) expect(html, href).not.toContain(`href="${href}"`);
      expect(html).toContain('Quick links');
    });

    it('a receptionist gets the sentence instead, with no tile they cannot open', () => {
      const html = draw('receptionist');
      expect(html).toContain('Still being set up');
      expect(html).toContain('owner is still setting this business up');
      expect(html).not.toContain('hm-tile');
    });

    it('a stylist gets the same as the receptionist', () => {
      expect(draw('staff')).toContain('Still being set up');
    });

    it('neither of them is offered the bell: there is no feed yet', () => {
      for (const role of ['owner', 'receptionist'] as const) expect(draw(role), role).not.toContain('hm-bell');
    });
  });

  it('a closed address lands on a page that says so, and that page is open', () => {
    expect(code('lib/screen-guard.ts')).toMatch(/NOT_LIVE_PATH = '\/not-live-yet'/);
    expect(isSetupDestination('/not-live-yet')).toBe(true);
    expect(code('not-live-yet/page.tsx')).toMatch(/isLive\(\(await api\.me\(\)\)\.tenant\?\.status\)\) redirect\('\/'\)/);
  });
});
