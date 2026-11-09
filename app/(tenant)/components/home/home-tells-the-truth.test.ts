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
    // Jira GRW-679 (UX-04) — the same rule, and one more: nothing until this period has takings either.
    expect(home).toMatch(/const periodDeltaShown = Boolean\(data && data\.money\.deltaPct !== null && data\.money\.deltaPct !== undefined && data\.money\.revenueMinor > 0\);/);
    expect(home).toMatch(/\{periodDeltaShown && data \? \(\s*<div className="rst-kpi-side">/);
    expect(home).not.toMatch(/cameBackPct \?\? 100/);
  });

  it('invents no payment or product row (PR 454 dropped the Recent activity feed and its read)', () => {
    expect(home).not.toMatch(/actProductSold\(/);
    expect(home).not.toMatch(/actPaymentReceived\(rupees\(g\.priceMinor\)\)/);
    expect(home).not.toMatch(/api\s*\.notifications\(/);
  });

  it('reads shelf stock only for stock alerts, never as a sales figure', () => {
    expect(home).not.toMatch(/pr\.sold \?\? 0\) \* Number\(pr\.priceMinor/);
    expect(home).toMatch(/const out = list\.filter\(\(pr\) => pr\.stock <= 0\);/);
  });

  it('has no Start that only one browser tab knows about', () => {
    expect(home).not.toMatch(/growza\.home\.started/);
    expect(home).not.toMatch(/startBooking|startedSet/);
  });

  it('calls a cancelled booking Cancelled in the Bookings table, and removes the duplicate table from Home', () => {
    const bookingsList = readFileSync(path.join(here, '../../appointments/BookingsList.tsx'), 'utf-8');
    expect(bookingsList).toMatch(/st === 'cancelled'\s*\?\s*hc\.cancelledLabel/);
    expect(copy).toMatch(/cancelledLabel: S\('Cancelled'/);
    expect(home).not.toMatch(/maxApptRows|showingOf/);
    expect(home).not.toContain('hm-v3-appts-card');
  });

  it('sends Walk-in somewhere of its own', () => {
    expect(home).toMatch(/sln-action-tile is-primary" href="\/appointments\/new\?mode=now"/);
  });

  it('makes the desk-only reads only where the desk Home is drawn', () => {
    expect(home).toMatch(/const DESK_QUERY = '\(min-width: 1101px\)'/);
    expect(home).toMatch(/if \(!branchContext\.ready \|\| !deskHome\) return;/);
  });
});

describe('the desk Products panel lets the keyboard out (QA, 2026-10-17)', () => {
  it('does not trap focus when drawn inline, like every sibling inline panel', () => {
    const src = readFileSync(path.join(here, '../../products/ProductSheet.tsx'), 'utf8');
    expect(src).toMatch(/useDialog\(sheetRef, \{[^}]*active: !inline/);
  });
});

describe('the Bookings today tile counts bookings, not the queue (QA, 2026-10-17)', () => {
  const home = readFileSync(path.join(here, 'OwnerHome.tsx'), 'utf8');

  it('shows the bookings, and keeps waiting tokens out of "later"', () => {
    // The counts are built from today's booking groups only; the token board is never read into them.
    const counts = home.slice(home.indexOf('const todayByState = useMemo'), home.indexOf('}, [todayGroups, now]);'));
    expect(counts).toContain('for (const g of todayGroups ?? [])');
    expect(counts).not.toMatch(/boardTokens|tokens/);
    expect(home).toMatch(/<strong className="rst-kpi-value">\{todayByState\.total\}<\/strong>/);
  });
});

