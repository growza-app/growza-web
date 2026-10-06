import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { setupCopy, setupHref } from '../lib/setup-copy';

/**
 * Jira GRW-516 — the setup banner lists everything a business still being set up needs, done or not.
 *
 * It was first written into the API repo's old `web/` folder, so the dashboard (which deploys from this repo)
 * never drew it: the API sent `setup` and nothing read it.
 */
const here = (p: string) => readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), p), 'utf-8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const banner = code('./SetupBanner.tsx');
const layout = code('../layout.tsx');
const css = here('../styles/99-setup-banner.css');
const globals = here('../globals.css');

describe('the setup banner', () => {
  it('is read from /me and drawn with the other account banners', () => {
    expect(layout).toMatch(/setup = me\.setup \?\? null;/);
    expect(layout).toMatch(/<SetupBanner setup=\{setup\} lang=\{lang\} \/>/);
    expect(layout.indexOf('<SetupBanner')).toBeGreaterThan(layout.indexOf('<div className="content-banners">'));
  });

  it('lists every item, not only the missing ones, with a progress count', () => {
    expect(banner).toMatch(/setup\.items\.map\(/);
    expect(banner).not.toMatch(/filter\(\(i\) => !i\.met\)/);
    expect(banner).toMatch(/c\.progress\(done, total\)/);
    expect(banner).toMatch(/item\.met \? c\.done : c\.todo/);
  });

  it('a missing item links to its screen; a done one is not a link', () => {
    expect(banner).toMatch(/const href = item\.met \? null : setupHref\(item\.key\);/);
    expect(setupHref('services')).toBe('/services');
    expect(setupHref('working_hours')).toBe('/providers');
    expect(setupHref('branch:abc')).toBe('/providers');
  });

  it('says why the salon\'s own hours do not clear the working-hours item', () => {
    expect(banner).toMatch(/item\.key === 'working_hours' \? <span className="setup-hint">/);
    expect(setupCopy('en').workingHoursHint).toMatch(/Salon hours alone are not enough/);
  });

  it('renders nothing when the API could not say, or the business is live', () => {
    expect(banner).toMatch(/if \(!setup \|\| setup\.items\.length === 0\) return null;/);
  });

  it('has its words in both languages, and no inline sizes', () => {
    for (const lang of ['en', 'hi'] as const) {
      const c = setupCopy(lang);
      expect(c.title && c.intro && c.allDone && c.workingHours && c.workingHoursHint && c.goLive).toBeTruthy();
      expect(c.progress(1, 4)).toMatch(/1/);
    }
    // CLAUDE.md: type in rem, no px font-size; icons are inline SVG, never a glyph.
    expect(css).not.toMatch(/font-size:\s*\d+px/);
    expect(banner).not.toMatch(/style=\{\{|ⓘ|○/);
  });

  it('rows are at least 44px and the sheet loads before the clay sheets', () => {
    expect(css).toMatch(/\.setup-row \{[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.setup-head \{[^}]*min-height: 44px;/);
    expect(globals.indexOf('99-setup-banner.css')).toBeLessThan(globals.indexOf('100-clay-tabs.css'));
  });
});
