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

  it('the admin portal still does not — it is a desktop tool with no safe-area insets', () => {
    const layout = read('app/admin/layout.tsx');
    expect(layout).not.toMatch(/manifest:\s*'/);
    expect(layout).not.toMatch(/<PwaRegister/);
  });
});
