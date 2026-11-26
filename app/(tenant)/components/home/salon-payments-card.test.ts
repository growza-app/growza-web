import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeCopy } from '../../lib/home-copy';

const code = (p: string) =>
  readFileSync(resolve(__dirname, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

/** Owner, 2026-11-26 — "for salon desktop can you also add payment card": it vanished every morning before the first payment. */
describe('the salon laptop Home always has its payments card', () => {
  const owner = code('OwnerHome.tsx');
  const parts = code('parts.tsx');
  const css = code('../../styles/99-z-emerald-v2.css');

  it('keeps the card with nothing paid yet, saying so in the middle of an empty track', () => {
    const gauge = parts.slice(parts.indexOf('export function PayGaugeCard'), parts.indexOf('export function DarkStatCard'));
    expect(gauge).toContain('if (!empty) return null;');
    expect(gauge).toContain('<span>{empty}</span>');
    expect(owner).toContain('empty={t.noMoneyYet}');
  });

  it('titles the card by the Today / Week / Month switch, as the money it shows follows that switch', () => {
    expect(owner).toContain("title={period === 'month' ? t.shop.paidThisMonth : period === 'week' ? t.shop.paidThisWeek : t.shop.paidToday}");
    for (const lang of ['en', 'hi'] as const) {
      const t = homeCopy(lang, {});
      expect(t.shop.paidThisWeek).toBeTruthy();
      expect(t.shop.paidThisMonth).toBeTruthy();
      expect(t.shop.paidThisWeek).not.toBe(t.shop.paidToday);
    }
  });

  it('draws the second way of paying in orange, on the arc and on its legend dot', () => {
    expect(css).toContain('.rst-gauge-arc.is-1 { stroke: var(--chart-weekend); }');
    expect(css).toContain('.rst-gauge-legend i.is-1 { background: var(--chart-weekend); }');
  });
});

describe('the Guests / Clients tile: white, with orange accents (owner, 2026-11-26)', () => {
  const css = code('../../styles/99-z-emerald-v2.css');
  const block = css.slice(css.lastIndexOf('@media (min-width: 861px)'));

  it('keeps the tile white and colours only its arrow, chip and week line, laptop only', () => {
    expect(block).not.toMatch(/\.rst-kpi\.rst-kpi-customers\s*\{\s*background/);
    expect(block).toContain('.rst-kpi-customers .rst-kpi-go {');
    expect(block).toContain('color: var(--amber-ink);');
    expect(block).toContain('stroke: var(--chart-weekend);');
  });
});
