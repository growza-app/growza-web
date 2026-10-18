import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Performance audit — links do not prefetch.
 *
 * `next/link` prefetches its target as soon as it scrolls into view, and for these pages that is a server render of the
 * target's layouts (`/api/v1/me`, the live-version probe) for a page nobody opened. Measured: the account menu alone, on
 * every screen, fired five to six per page load. `AppLink` turns it off; this keeps it off.
 */
const appDir = resolve(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' || name === '.next' ? [] : sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('links in the dashboard', () => {
  it('come from AppLink, so none of them prefetch: no file imports next/link directly', () => {
    const offenders = sources(appDir)
      .filter((f) => !f.endsWith('shared/AppLink.tsx'))
      .filter((f) => /from ['"]next\/link['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(appDir.length + 1));
    expect(offenders, 'import Link from the AppLink in app/shared instead of next/link').toEqual([]);
  });

  it('AppLink switches prefetch off first, so a link that wants it can still say so', () => {
    const src = readFileSync(resolve(__dirname, 'AppLink.tsx'), 'utf8');
    expect(src).toMatch(/<Link prefetch=\{false\} \{\.\.\.props\} \/>/);
  });
});
