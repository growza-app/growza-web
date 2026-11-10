import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addressFor, businessOriginFrom } from './admin-address';

/** Jira GRW-689 — the admin portal at admin.growza.biz, so Growza and Growza Admin install side by side. */
describe('which address a page belongs to', () => {
  it('an admin page asked for on app.growza.biz goes to admin.growza.biz, path and query kept', () => {
    expect(addressFor('app.growza.biz', '/admin/businesses/123', '?tab=usage')).toBe('https://admin.growza.biz/admin/businesses/123?tab=usage');
    expect(addressFor('app.growza.biz', '/admin')).toBe('https://admin.growza.biz/admin');
  });
  it('admin.growza.biz on its own opens the admin portal', () => {
    expect(addressFor('admin.growza.biz', '/')).toBe('https://admin.growza.biz/admin');
  });
  it('a business page asked for on the admin address goes to app.growza.biz', () => {
    expect(addressFor('admin.growza.biz', '/pos', '?mode=queue')).toBe('https://app.growza.biz/pos?mode=queue');
    expect(addressFor('admin.growza.biz', '/claim-session')).toBe('https://app.growza.biz/claim-session');
  });
  it('business pages on app.growza.biz and admin pages on admin.growza.biz stay where they are', () => {
    for (const p of ['/', '/pos', '/orders', '/customers', '/login', '/claim-session']) expect(addressFor('app.growza.biz', p), p).toBeNull();
    for (const p of ['/admin', '/admin/login', '/admin/businesses/1']) expect(addressFor('admin.growza.biz', p), p).toBeNull();
  });
  it('a path that only starts with the letters "admin" is not the admin', () => {
    expect(addressFor('app.growza.biz', '/administer')).toBeNull();
  });
  it('localhost, a test box or a tunnel is never redirected', () => {
    for (const h of ['localhost:3001', 'localhost', '13.233.205.126', 'example.trycloudflare.com', null]) expect(addressFor(h, '/admin'), String(h)).toBeNull();
  });
  it('keeps the port and the scheme it was asked on (a local check on *.localhost)', () => {
    expect(addressFor('APP.growza.biz:8443', '/admin', '', 'http')).toBe('http://admin.growza.biz:8443/admin');
  });
});

describe('"Open as business" from the admin address', () => {
  it('sends the business app on app.growza.biz; anywhere else it stays on this address', () => {
    expect(businessOriginFrom({ hostname: 'admin.growza.biz', protocol: 'https:', port: '' })).toBe('https://app.growza.biz');
    expect(businessOriginFrom({ hostname: 'app.growza.biz', protocol: 'https:', port: '' })).toBeNull();
    expect(businessOriginFrom({ hostname: 'localhost', protocol: 'http:', port: '3001' })).toBeNull();
  });
  it('hands the grant over in the fragment, and the claim page wipes it before anything else', () => {
    const admin = readFileSync(resolve(__dirname, '../admin/businesses/[id]/page.tsx'), 'utf8');
    expect(admin).toContain('window.location.assign(`${business}/claim-session#${encodeURIComponent(started.grant)}`)');
    const claim = readFileSync(resolve(__dirname, '../(auth)/claim-session/page.tsx'), 'utf8');
    expect(claim.indexOf("window.history.replaceState(null, '', '/claim-session')")).toBeLessThan(claim.indexOf("fetch('/api/v1/auth/claim-impersonation'"));
  });
  it('the middleware redirects page requests only — never an API call or a file', () => {
    const mw = readFileSync(resolve(__dirname, '../../middleware.ts'), 'utf8');
    expect(mw).toMatch(/if \(!isProxiedToApi\(pathname\) && !isStaticAsset\(pathname\)\) \{\s*const proto[\s\S]*?addressFor\(/);
    expect(mw).toContain('NextResponse.redirect(to, 308)');
  });
});
