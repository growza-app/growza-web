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
const render = (items: Item[], { canAct = true, lang = 'en' as const } = {}) =>
  renderToStaticMarkup(createElement(SetupBanner, { setup: { items }, lang, canAct }));
const glow: Item[] = [
  { key: 'services', met: true },
  { key: 'providers', met: true },
  { key: 'salon_hours', met: false },
  { key: 'working_hours', met: false },
];

describe('the setup banner', () => {
  it('lists every item, done and to do, with a count that matches the rows', () => {
    const html = render(glow);
    for (const s of ['Add at least one service', 'Add a member of staff', "Set your salon&#x27;s opening hours", "Set a staff member&#x27;s working hours"]) {
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

  it('a receptionist or stylist is told, not sent to screens they cannot open', () => {
    const html = render(glow, { canAct: false });
    expect(html).not.toContain('href=');
    expect(html).toContain('The owner is finishing these');
  });

  it('the staff-hours hint sits under that line only', () => {
    const html = render(glow);
    expect((html.match(/class="setup-hint"/g) ?? []).length).toBe(1);
    expect(html).toContain('Salon hours alone are not enough');
  });

  it('folded at first (a phone keeps it that way), still saying what is next', () => {
    const html = render(glow);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Next: Set your salon&#x27;s opening hours");
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
    expect(renderToStaticMarkup(createElement(SetupBanner, { setup: null, lang: 'en', canAct: true }))).toBe('');
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

  it('is wired in the layout, owner-only links, and the sheet follows the rules', () => {
    const layout = code('../layout.tsx');
    const css = here('../styles/99-setup-banner.css');
    expect(layout).toMatch(/setup = me\.setup \?\? null;/);
    expect(layout).toMatch(/<SetupBanner setup=\{setup\} lang=\{lang\} canAct=\{role === null \|\| role === 'owner'\} \/>/);
    expect(css).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/#[0-9a-f]{6}|rgba\(/i);
    expect(css).toMatch(/\.setup-row \{[^}]*min-height: 44px;/);
    expect(here('../globals.css').indexOf('99-setup-banner.css')).toBeLessThan(here('../globals.css').indexOf('100-clay-tabs.css'));
  });
});
