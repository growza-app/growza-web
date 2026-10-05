import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-538 — Bookings and Clients are tab-bar screens: nothing is behind them, so on a phone their header
 * wears the menu button (as Home does), not Back. Every other screen keeps Back (GRW-497).
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (p: string) => strip(readFileSync(resolve(__dirname, p), 'utf8'));

describe('the menu button on Bookings and Clients', () => {
  const header = read('./PageHeader.tsx');

  it('PageHeader takes `menu` and shows the menu button in place of Back', () => {
    expect(header).toMatch(/\{onBack \? null : menu \? <MenuButton \/> : <BackButton phoneOnly \/>\}/);
  });

  it('Bookings (both headers) and Clients ask for it', () => {
    const bookings = read('../appointments/page.tsx');
    expect(bookings.match(/<PageHeader [^>]*\bmenu \/>/g)?.length).toBe(2);
    expect(read('../customers/page.tsx')).toMatch(/<PageHeader [^>]*\bmenu \/>/);
    expect(read('../customers/CustomersClient.tsx')).toMatch(/<PageHeader\s+title=\{label\}\s+menu\b/);
  });

  it('no other screen asks for it, so they keep Back', () => {
    for (const f of ['../offers/page.tsx', '../providers/page.tsx', '../services/page.tsx', '../reports/page.tsx']) {
      let src = '';
      try {
        src = read(f);
      } catch {
        continue;
      }
      expect(src, f).not.toMatch(/<PageHeader [^>]*\bmenu\b/);
    }
  });
});
