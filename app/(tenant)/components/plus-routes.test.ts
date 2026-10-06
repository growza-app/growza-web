import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-508 — the floating New booking is on Home, Bookings and Clients, and nowhere else.
 * An allow-list of exact paths, so a new screen has none until it is added.
 */
const chrome = readFileSync(resolve(__dirname, 'MobileChrome.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const source = /const PLUS_ROUTE_RE = \/(.*)\/;/.exec(chrome)?.[1] ?? '$^';
const shows = (path: string) => new RegExp(source).test(path);

describe('where the floating plus is drawn', () => {
  it('is gated by the allow-list, and by who may book', () => {
    expect(chrome).toMatch(/mayBook && live && PLUS_ROUTE_RE\.test\(pathname\) \?/);
  });

  it('shows on Home, Bookings and Clients', () => {
    for (const p of ['/', '/appointments', '/customers', '/appointments/', '/customers/']) expect(shows(p)).toBe(true);
  });

  it('shows nowhere else — including the booking page itself and one client', () => {
    for (const p of [
      '/appointments/new', '/customers/abc', '/providers', '/providers/abc', '/services', '/offers', '/packages',
      '/reports', '/settings', '/settings/booking', '/notifications', '/attendance', '/search', '/availability',
    ]) expect({ p, shows: shows(p) }).toEqual({ p, shows: false });
  });
});
