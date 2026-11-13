import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-06 — "add the cash in drawer line".
 *
 * "How they paid" splits the day's takings and cannot say a cash bill was refunded by UPI. The API now answers the
 * other question — the cash taken today, less the cash handed back — and the day sheet says it (Home did until 2026-11-13). Source-
 * reading, like the other client-component tests here: there is no DOM in this suite.
 */
const dir = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
const drawer = dir('CashDrawer.tsx');
const shop = dir('ShopHome.tsx');
const day = dir('ShopDayBody.tsx');
const copy = dir('../../lib/home-copy.ts');
const types = dir('../../lib/home-types.ts');

describe('the figure', () => {
  it('is drawn only when cash moved, and never as ₹0 on a quiet day', () => {
    expect(drawer).toMatch(/const moving = \(d: CashDrawerFigure \| undefined\): d is CashDrawerFigure => d !== undefined && \(d\.takenMinor > 0 \|\| d\.refundedMinor > 0\);/);
    expect(drawer.match(/if \(!moving\(cashDrawer\)\) return null;/g)).toHaveLength(1);
  });

  it('shows what came in, what was handed back as a minus, and what is left', () => {
    expect(drawer).toMatch(/t\.cashTaken/);
    expect(drawer).toMatch(/`−\$\{rupees\(cashDrawer\.refundedMinor\)\}`/);
    expect(drawer).toMatch(/rupees\(cashDrawer\.inDrawerMinor\)/);
  });

  it('is not on Home any more — the owner took the row off on 2026-11-13; the day sheet keeps the card', () => {
    expect(shop).not.toContain('CashDrawerLine');
    expect(shop).not.toContain('cashDrawer');
    expect(drawer).not.toContain('CashDrawerLine');
  });

  it('is on the day sheet, after what was given away', () => {
    expect(day.indexOf('<CashDrawerCard')).toBeGreaterThan(day.indexOf('<GivenAwayCard'));
  });

  it('is optional on the types, so an older API reads as nothing', () => {
    expect(types).toMatch(/cashDrawer\?: CashDrawerFigure;/);
  });
});

describe('the words', () => {
  it('exist in English and Hindi, in plain terms', () => {
    for (const key of ['cashInDrawer', 'cashInDrawerSub', 'cashTaken', 'cashHandedBack', 'cashLeft']) {
      expect(copy, key).toMatch(new RegExp(`${key}: S\\('[^']+', '[^']+'\\)`));
    }
    expect(copy).toContain("cashInDrawer: S('Cash in drawer'");
  });
});
