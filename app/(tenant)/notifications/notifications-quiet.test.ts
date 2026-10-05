import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-507 — Notifications on a phone is a quiet page: Back and the title, and nothing else in the
 * header (no search / bell / avatar group, no branch line), and no floating New booking over the list.
 * Phone only: the laptop header is untouched.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('Notifications is a quiet page on a phone', () => {
  it('asks for a bare header', () => {
    expect(read('./NotificationsClient.tsx')).toMatch(/<PageHeader title=\{n\('title'\)\} onBack=\{\(\) => router\.back\(\)\} bare \/>/);
    expect(read('../components/PageHeader.tsx')).toMatch(/\$\{bare \? 'topbar-bare' : ''\}/);
  });

  it('hides the controls and the branch line, below 861px only', () => {
    expect(read('../styles/76-header-controls.css')).toMatch(
      /@media \(max-width: 860px\) \{\s*\.topbar-bare \.topbar-actions,\s*\.topbar-bare \.hbp-line \{\s*display: none;/,
    );
  });

  it('draws no floating New booking there, and nowhere else is affected', () => {
    const chrome = read('../components/MobileChrome.tsx');
    // Jira GRW-508 — an allow-list now (Home, Bookings, Clients), so Notifications is simply not on it.
    expect(chrome).toMatch(/PLUS_ROUTE_RE\.test\(pathname\)/);
    const re = new RegExp(/const PLUS_ROUTE_RE = \/(.*)\/;/.exec(chrome)?.[1] ?? '$^');
    expect(re.test('/notifications')).toBe(false);
  });
});
