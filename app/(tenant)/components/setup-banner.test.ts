import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { setupCopy, setupHref } from '../lib/setup-copy';
import { SetupBanner } from './SetupBanner';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never),
}));

/**
 * Jira GRW-516 — the setup banner lists everything a business still being set up needs, done or not.
 *
 * It was first written into the API repo's old `web/` folder, so the dashboard (which deploys from this repo)
 * never drew it: the API sent `setup` and nothing read it.
 */
const here = (p: string) => readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), p), 'utf-8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

type Item = { key: string; met: boolean; branchName?: string };
const render = (items: Item[], opts: { lang?: 'en' | 'hi'; mode?: 'setup' | 'attention' } = {}) =>
  renderToStaticMarkup(
    createElement(SetupBanner, { setup: { items, ...(opts.mode ? { mode: opts.mode } : {}) }, lang: opts.lang ?? 'en' }),
  );
const glow: Item[] = [
  { key: 'services', met: true },
  { key: 'providers', met: true },
  { key: 'salon_hours', met: false },
  { key: 'working_hours', met: false },
];

describe('the setup banner', () => {
  it('lists every item, done and to do, with a count that matches the rows', () => {
    const html = render(glow);
    for (const s of ['Add at least one service', 'Add a member of staff', 'Set your opening hours', "Set a staff member&#x27;s working hours"]) {
      expect(html, s).toContain(s);
    }
    expect(html).toContain('2 of 4 done');
    expect((html.match(/class="setup-item/g) ?? []).length).toBe(4);
  });

  it('an owner gets a link on each thing left, and none on a thing done', () => {
    const html = render(glow);
    expect(html).toContain('href="/settings/working-hours"');
    expect(html).toContain('href="/providers"');
    expect(html).not.toContain('href="/services"');
  });

  it('the staff-hours hint sits under that line only', () => {
    const html = render(glow);
    expect((html.match(/class="setup-hint"/g) ?? []).length).toBe(1);
    expect(html).toContain('Opening hours alone are not enough');
  });

  it('folded at first (a phone keeps it that way), still saying what is next', () => {
    const html = render(glow);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain('Next: Set your opening hours');
  });

  it('an item it does not know is left out, not worded as a branch', () => {
    const html = render([...glow, { key: 'owner', met: false }, { key: 'something_new', met: false }]);
    expect(html).toContain('2 of 4 done');
    expect(html).not.toContain(': add a member of staff');
  });

  it('a branch item names its branch', () => {
    expect(render([{ key: 'branch:x', met: false, branchName: 'Indiranagar' }])).toContain('Indiranagar: add a member of staff with working hours');
  });

  it('all done says so; nothing at all when the API could not say', () => {
    const html = render(glow.map((i) => ({ ...i, met: true })));
    expect(html).toContain('4 of 4 done');
    expect(html).toContain('Everything is added');
    expect(renderToStaticMarkup(createElement(SetupBanner, { setup: null, lang: 'en' }))).toBe('');
  });

  it('reads in Hindi', () => {
    const html = render(glow, { lang: 'hi' as never });
    expect(html).toContain(setupCopy('hi').title);
    expect(html).not.toContain('Finish setting up');
  });

  it('links go where each thing is done', () => {
    expect(setupHref('services')).toBe('/services');
    expect(setupHref('salon_hours')).toBe('/settings/working-hours');
    expect(setupHref('working_hours')).toBe('/providers');
    expect(setupHref('branch:abc')).toBe('/providers');
  });

  it('a link folds the banner on a phone, so it does not cover the screen it opened', () => {
    const src = code('./SetupBanner.tsx');
    expect(src).toMatch(/onClick=\{\(\) => \{\s*if \(window\.matchMedia\('\(max-width: 860px\)'\)\.matches\) setOpen\(false\);/);
  });

  it('is wired in the layout (the API sends it to the owner only), and the sheet follows the rules', () => {
    const layout = code('../layout.tsx');
    const css = here('../styles/99-setup-banner.css');
    expect(layout).toMatch(/setup = me\.setup \?\? null;/);
    expect(layout).toMatch(/<SetupBanner setup=\{setup\} lang=\{lang\} \/>/);
    expect(css).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/#[0-9a-f]{6}|rgba\(/i);
    expect(css).toMatch(/\.setup-row \{[^}]*min-height: 44px;/);
    expect(here('../globals.css').indexOf('99-setup-banner.css')).toBeGreaterThan(-1);
  });
});

/**
 * Owner, 2026-10-26 — "I created a restaurant but it's saying salon and service."
 *
 * The banner is shown to every kind of business, and it had salon written into it in both languages. Which
 * ITEMS appear is the API's decision (`readinessFor` builds them from the business's own capabilities); what
 * is held here is that whatever arrives, none of it calls somebody's restaurant a salon.
 */
describe('the words a business that is not a salon reads', () => {
  it('never says salon, in either language', () => {
    for (const lang of ['en', 'hi'] as const) {
      const c = setupCopy(lang);
      const words = [c.title, c.intro, c.services, c.providers, c.salonHours, c.workingHours, c.workingHoursHint, c.allDone].join(' ');
      expect({ lang, salon: /salon|सैलून/i.test(words) }).toEqual({ lang, salon: false });
    }
  });

  it('does not promise bookings to a business that will never take one', () => {
    // A restaurant and a shop have `booking.enabled` off. "It cannot take bookings yet" named a thing they
    // are not waiting for; what they are waiting for is being switched on.
    for (const lang of ['en', 'hi'] as const) {
      expect({ lang, bookings: /booking|बुकिंग/i.test(setupCopy(lang).intro) }).toEqual({ lang, bookings: false });
    }
  });

  it('renders only the items the API sent, so a restaurant sees no service line', () => {
    // What a restaurant's `/me` now carries: an owner is implicit, and bookings are off.
    const html = render([{ key: 'salon_hours', met: false }]);
    expect(html).toContain('Set your opening hours');
    expect(html).not.toContain('Add at least one service');
    expect(html).not.toContain('Add a member of staff');
    expect(html).toContain('0 of 1 done');
  });
});

/**
 * Owner, 2026-10-26 — the LIVE business that has since lost something off the same list.
 *
 * `/me` sends `mode: 'attention'` with only the missing rows then, and sends nothing at all when nothing is
 * missing. The banner is the same component saying a different thing: a fault, not a to-do list.
 */
describe('the attention banner (a live business missing something)', () => {
  const missing: Item[] = [{ key: 'salon_hours', met: false }];

  it('says what is missing in its own words, not the setup ones', () => {
    const html = render(missing, { mode: 'attention' });
    expect(html).toContain('Something is missing');
    expect(html).toContain('Your business is live, but this is not set up. Please add it.');
    expect(html).not.toContain('Finish setting up your business');
    expect(html).not.toContain('the Growza team will switch it on');
  });

  it('shows no progress count — "0 of 1 done" about a trading business says nothing', () => {
    expect(render(missing, { mode: 'attention' })).not.toContain('setup-progress');
    expect(render(missing)).toContain('setup-progress');
  });

  it('still links each missing row to the screen that fixes it', () => {
    expect(render(missing, { mode: 'attention' })).toContain('href="/settings/working-hours"');
  });

  it('names no kind of business, in either language', () => {
    for (const lang of ['en', 'hi'] as const) {
      const html = render([{ key: 'services', met: false }], { mode: 'attention', lang });
      expect(html.toLowerCase(), lang).not.toContain('salon');
      expect(html, lang).not.toContain('सैलून');
    }
  });

  it('marks itself so the live case reads harder than the setup one', () => {
    expect(render(missing, { mode: 'attention' })).toContain('setup-banner-attention');
    expect(render(missing)).not.toContain('setup-banner-attention');
  });

  it('renders nothing when the API sends no items', () => {
    expect(render([], { mode: 'attention' })).toBe('');
  });

  it('is Home\'s alone, while the setup one stays above every screen', () => {
    /*
     * A business that has not opened yet IS its checklist, so that banner belongs on whatever screen the owner
     * is on. A live one is trading, and a banner that follows them onto the screen they went to fix is the
     * repetition GRW-556 took off Home's siblings.
     */
    const layout = code('../layout.tsx');
    expect(layout).toMatch(/setup\?\.mode === 'attention' \? \(\s*<HomeOnly>\s*<SetupBanner setup=\{setup\} lang=\{lang\} \/>\s*<\/HomeOnly>/);
    expect(layout).toMatch(/\) : \(\s*<SetupBanner setup=\{setup\} lang=\{lang\} \/>\s*\)/);
  });
});
