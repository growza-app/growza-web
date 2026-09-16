import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-262 · GRW-269 — what Chrome needs before it will offer "Install app".
 *
 * Nothing in the browser says why an install option is missing; it simply is
 * not there. On prod the manifest, the icons and the service worker all loaded
 * fine, and the sign-in page — the first page a new owner ever sees — linked
 * none of them. These checks read the files the build ships, so the next time
 * a layout drops the link, a test says so instead of an owner's phone.
 */

const web = (path: string) => resolve(__dirname, '../../..', path);
const read = (path: string) => readFileSync(web(path), 'utf8');

const manifest = JSON.parse(read('public/manifest.json')) as {
  id?: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

describe('the manifest Chrome installs from', () => {
  it('is called Growza, not "Booking Dashboard"', () => {
    expect(manifest.name).toBe('Growza');
    expect(manifest.short_name).toBe('Growza');
  });

  it('has what Chrome requires: a standalone display and a start_url inside its scope', () => {
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display);
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    // Set once, before anyone installs: changing `id` later makes every
    // installed copy a different app from the one the server describes.
    expect(manifest.id).toBe('/');
  });

  it('has a 192 and a 512 icon, and every icon it lists is actually shipped', () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    for (const icon of manifest.icons) {
      expect(existsSync(web(`public${icon.src}`)), icon.src).toBe(true);
    }
  });

  it('ships the service worker the layouts register', () => {
    expect(existsSync(web('public/sw.js'))).toBe(true);
  });
});

describe('which pages can be installed', () => {
  it('the sign-in page links the manifest and registers the service worker', () => {
    const layout = read('app/(auth)/layout.tsx');
    expect(layout).toMatch(/manifest:\s*'\/manifest\.json'/);
    expect(layout).toMatch(/<PwaRegister\s*\/>/);
  });

  it('the salon dashboard still does', () => {
    const layout = read('app/(tenant)/layout.tsx');
    expect(layout).toMatch(/manifest:\s*'\/manifest\.json'/);
    expect(layout).toMatch(/<PwaRegister\s*\/>/);
  });

  it('the home-screen title is Growza on both', () => {
    for (const path of ['app/(auth)/layout.tsx', 'app/(tenant)/layout.tsx']) {
      expect(read(path), path).toMatch(/appleWebApp:\s*{[^}]*title:\s*'Growza'/);
    }
  });

  /**
   * Jira GRW-265 · GRW-270 — reversed on purpose. GRW-262 kept the admin portal
   * out; the owner asked for it to install too, as its own app.
   */
  it('the admin portal installs as its own app, from its own manifest', () => {
    const layout = read('app/admin/layout.tsx');
    expect(layout).toMatch(/manifest:\s*'\/admin-manifest\.json'/);
    expect(layout).not.toMatch(/manifest:\s*'\/manifest\.json'/);
    expect(layout).toMatch(/<PwaRegister\s*\/>/);
    expect(layout).toMatch(/appleWebApp:\s*{[^}]*title:\s*'Growza Admin'/);
    // Still no viewport-fit=cover: the admin stylesheet has no safe-area insets.
    // Checked in the exported object, not the file — its comment names the setting.
    const viewport = layout.slice(layout.indexOf('export const viewport'));
    expect(viewport.slice(0, viewport.indexOf('};'))).not.toMatch(/viewportFit/);
  });
});

describe('the admin manifest (Jira GRW-265)', () => {
  const admin = JSON.parse(read('public/admin-manifest.json')) as typeof manifest;

  it('is a different app from the salon one, starting and staying under /admin', () => {
    expect(admin.id).toBe('/admin');
    expect(admin.id).not.toBe(manifest.id);
    expect(admin.start_url).toBe('/admin');
    expect(admin.scope).toBe('/admin');
    expect(admin.start_url.startsWith(admin.scope)).toBe(true);
    expect(admin.name).toBe('Growza Admin');
  });

  it('meets the same install requirements, with icons that exist', () => {
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(admin.display);
    expect(admin.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of admin.icons) expect(existsSync(web(`public${icon.src}`)), icon.src).toBe(true);
  });
});

describe('every installable root captures the install offer before the page (Jira GRW-265)', () => {
  for (const path of ['app/(auth)/layout.tsx', 'app/(tenant)/layout.tsx', 'app/admin/layout.tsx']) {
    it(path, () => {
      const layout = read(path);
      expect(layout).toMatch(/<InstallPromptCapture\s*\/>/);
      // Before the page content, or a prompt fired early is lost.
      expect(layout.indexOf('<InstallPromptCapture')).toBeLessThan(layout.indexOf('{children}'));
    });
  }
});

describe('the install banner is on every sign-in and dashboard page (Jira GRW-265)', () => {
  for (const [path, app] of [
    ['app/(auth)/layout.tsx', 'salon'],
    ['app/(tenant)/layout.tsx', 'salon'],
    ['app/admin/layout.tsx', 'admin'],
  ] as const) {
    it(`${path} renders the ${app} banner`, () => {
      expect(read(path)).toMatch(new RegExp(`<InstallBanner app="${app}"\\s*/>`));
    });
  }

  it('and no header gains an Install button — the owner asked for the banner instead', () => {
    for (const path of [
      'app/(tenant)/components/HeaderControls.tsx',
      'app/(tenant)/components/home/parts.tsx',
      'app/admin/components/AdminShell.tsx',
      'app/admin/login/page.tsx',
    ]) {
      expect(read(path), path).not.toMatch(/Install(Button|Banner)/);
    }
  });
});
