import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Jira GRW-476 — the dashboard's own headers and the tunnel gate. Source-reading: config is not executed here. */
const config = readFileSync(resolve(__dirname, '../../next.config.ts'), 'utf8');
const middleware = readFileSync(resolve(__dirname, '../../middleware.ts'), 'utf8');

describe('dashboard headers', () => {
  it('refuses framing, sniffing and the framework banner', () => {
    expect(config).toMatch(/poweredByHeader: false/);
    expect(config).toMatch(/frame-ancestors 'none'/);
    expect(config).toMatch(/X-Content-Type-Options', value: 'nosniff'/);
  });
});

describe('tunnel gate', () => {
  it('splits on the first colon, compares in constant time, survives a bad header, and gates image resizing', () => {
    expect(middleware).toMatch(/decoded\.indexOf\(':'\)/);
    expect(middleware).toMatch(/function sameText/);
    expect(middleware).toMatch(/catch \{\s*decoded = ''/);
    expect(middleware).not.toMatch(/_next\/image\|favicon/);
  });
});

/**
 * Review 2026-11-05 — the script policy is for pages. A file was being handed a nonce and a twelve-part policy
 * on every request; named by extension, so a page whose address contains a dot still gets its policy.
 */
describe('which requests are handed the script policy', () => {
  const literal = /const STATIC_FILE = (\/.+\/i);/.exec(middleware)?.[1];
  const isFile = (path: string): boolean => (new Function(`return ${literal}`)() as RegExp).test(path);

  it('skips the files a page pulls in', () => {
    expect(literal).toBeDefined();
    for (const path of ['/icon.png', '/sw.js', '/manifest.webmanifest', '/icons/app-192.png', '/fonts/figtree.woff2']) expect(isFile(path), path).toBe(true);
    expect(middleware).toMatch(/pathname\.startsWith\('\/_next\/image'\) \|\| STATIC_FILE\.test\(pathname\)/);
  });

  it('never skips a page, dot or no dot', () => {
    for (const path of ['/', '/pos', '/login', '/admin/businesses', '/settings/gst', '/customers/a.b', '/documents/2026.11']) expect(isFile(path), path).toBe(false);
    expect(middleware).toMatch(/if \(isProxiedToApi\(pathname\) \|\| isStaticAsset\(pathname\)\) return NextResponse\.next\(\);/);
  });
});
