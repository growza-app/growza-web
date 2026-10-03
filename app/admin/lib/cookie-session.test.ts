import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-480 (S-10) — the admin portal never holds its session token, and runs only the scripts it was sent with.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('the admin session is a cookie the page cannot read', () => {
  it('no request carries an Authorization header, and nothing stores a token', () => {
    expect(read('api.ts')).not.toMatch(/headers\.set\('Authorization'/);
    expect(read('session.ts')).not.toMatch(/token: string/);
    expect(read('refresh.ts')).not.toMatch(/body\.token/);
    expect(read('../login/page.tsx')).not.toMatch(/body\.token/);
  });
});

describe('a strict CSP on every admin page', () => {
  const middleware = read('../../../middleware.ts');
  it('sets a per-request nonce with strict-dynamic for /admin, and no unsafe-inline scripts', () => {
    expect(middleware).toMatch(/pathname\.startsWith\('\/admin'\)/);
    expect(middleware).toMatch(/script-src 'self' 'nonce-\$\{nonce\}' 'strict-dynamic'/);
    expect(middleware).not.toMatch(/script-src[^"`]*'unsafe-inline'/);
    expect(middleware).toMatch(/object-src 'none'/);
  });

  it('the one inline script carries the nonce', () => {
    expect(read('../layout.tsx')).toMatch(/<InstallPromptCapture nonce=\{nonce\} \/>/);
  });
});
