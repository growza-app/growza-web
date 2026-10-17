import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Release review, 2026-10-17 — the laptop Home (Command Center) drew numbers nobody had counted: a fixed "↑ 12%" with no
 * previous period, a sample Mon–Sun chart, "↑ 14%" on products, a payment feed that said UPI for everything. Each of
 * these pins one of those staying gone.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const home = readFileSync(path.join(here, 'OwnerHome.tsx'), 'utf-8');
const copy = readFileSync(path.join(here, '../../lib/home-copy.ts'), 'utf-8');

describe('the owner Home shows only what was counted', () => {
  it('has no fixed growth figure or sample chart left in it', () => {
    for (const fake of ['↑ 12%', '↑ 14%', '↑ 18%', 'Math.max(15,', '[24, 34, 42, 38, 62, 100, 74]', '[30, 48, 42, 66, 80, 100]', "'12K'", 'revenueMinor: 320000', '16 + idx * 8']) {
      expect(home, fake).not.toContain(fake);
    }
    expect(home).not.toContain('<span>12K</span>');
    expect(home).not.toContain('hm-v3-mini-wave');
  });

  it('shows a change only when there is a previous period to compare with', () => {
    expect(home).toMatch(/data\?\.money\.deltaPct !== null && data\?\.money\.deltaPct !== undefined \? \(/);
    expect(home).not.toMatch(/cameBackPct \?\? 100/);
  });

  it('feeds Recent activity from real events only, with no invented payment or product row', () => {
    expect(home).not.toMatch(/actProductSold\(/);
    expect(home).not.toMatch(/actPaymentReceived\(rupees\(g\.priceMinor\)\)/);
    expect(home).toMatch(/\}, \[activities, p\.timezone, t\]\);/);
  });

  it('reads the products card from the period (money.products), not from the shelf\'s lifetime counts', () => {
    expect(home).toMatch(/const productTake = data\?\.money\.products \?\? null;/);
    expect(home).not.toMatch(/pr\.sold \?\? 0\) \* Number\(pr\.priceMinor/);
    expect(home).not.toMatch(/api\s*\.products\(branch\)/);
  });

  it('has no Start that only one browser tab knows about', () => {
    expect(home).not.toMatch(/growza\.home\.started/);
    expect(home).not.toMatch(/startBooking|startedSet/);
  });

  it('calls a cancelled booking Cancelled, and says how many rows a tab holds', () => {
    expect(home).toMatch(/st === 'cancelled'\s*\?\s*t\.cancelledLabel/);
    expect(copy).toMatch(/cancelledLabel: S\('Cancelled'/);
    expect(home).toMatch(/t\.showingOf\(shownRows, matchingRows\)/);
  });

  it('keeps the revenue trend a label, so it cannot change the headline card\'s period', () => {
    expect(home).toMatch(/hm-v3-period-pill is-static/);
    expect(home).not.toMatch(/const next = period === 'week' \? 'month' : 'week';/);
  });

  it('sends Walk-in and Add client somewhere of their own', () => {
    expect(home).toMatch(/hm-v3-qbtn is-mint" href="\/appointments\/new\?mode=now"/);
    expect(home).toMatch(/hm-v3-qbtn is-purple" href="\/customers\?add=1"/);
  });

  it('makes the desk-only reads only where the desk Home is drawn', () => {
    expect(home).toMatch(/const DESK_QUERY = '\(min-width: 1101px\)'/);
    expect(home).toMatch(/if \(!branchContext\.ready \|\| !deskHome\) return;/);
  });
});
