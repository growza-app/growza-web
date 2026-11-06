import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-06 — an order paid partly in reward points says so on its own screen. The Money card showed only the
 * net figures, so ₹475 for ₹500 of food left the owner asking where the ₹25 went. The API sends `rewardPoints`
 * (points kept after any refund, and what they were worth); the card draws one muted row when it is there.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./OrderClient.tsx');
const css = here('../../styles/99-orders.css');
const words = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).orders.detail as Record<string, string>;

describe('the Money card names the points', () => {
  it('draws the row only when the order carries points, as a muted note rather than a sum', () => {
    expect(client).toMatch(/order\.rewardPoints \? \(\s*<div className="ord-d-note">/);
    expect(client).toContain("t('detail.pointsUsedValue', { points: order.rewardPoints.points");
    expect(css).toMatch(/\.ord-d-money > \.ord-d-note dd \{\s*color: var\(--muted\);/);
  });

  it('has the words in English and Hindi, and the English counts one point as a point', () => {
    for (const lang of ['en', 'hi'] as const) {
      expect(words(lang).pointsUsed, lang).toBeTruthy();
      expect(words(lang).pointsUsedValue, lang).toContain('{off}');
    }
    expect(words('en').pointsUsedValue).toContain('plural');
  });
});
