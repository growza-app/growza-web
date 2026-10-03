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
