import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-270 · GRW-275 — how the money came in, under the amount, on a phone.
 *
 * The ⋯ menu used to swap the card between totals and the payment split, so a
 * phone never showed both. The split is now always rendered; ⋯ shows the same
 * split as a list. Checked in a browser at 320–1440px; these pin the markup.
 */
const hero = readFileSync(resolve(__dirname, 'MoneyHero.tsx'), 'utf8');

describe('Money today on a phone', () => {
  it('AC-01 — the split is never hidden behind a view switch', () => {
    // Jira GRW-312 — a phone reads the split as ONE line (PaymentLine) in its own block, the laptop
    // keeps the bar and tiles; both are drawn, each for its own width, and neither is behind a switch.
    expect(hero).toMatch(/<div className="hm-hero-phone hm-mobile">/);
    expect(hero).toMatch(/<PaymentLine t=\{t\} slices=\{money\.byPaymentMode\}/);
    expect(hero).toMatch(/<div className="hm-hero-pay hm-desktop">/);
    // The figures strip carries no phone-hiding class (`hm-desktop-inline` on the "vs yesterday"
    // words is fine).
    expect(hero).toMatch(/<div className="hm-hero-stats">/);
    expect(hero).not.toMatch(/setView/);
  });

  it('AC-02 — the ⋯ menu shows the same split, as a list, with the total', () => {
    const menu = hero.slice(hero.indexOf('hm-pay-menu'));
    expect(menu).toMatch(/rupees\(money\.revenueMinor\)/);
    expect(menu).toMatch(/<PaymentBar t=\{t\} slices=\{money\.byPaymentMode\} total=\{money\.revenueMinor\} variant="list" \/>/);
  });

  it('AC-03 — nothing taken yet reads as words, not an empty bar', () => {
    expect(hero).toMatch(/if \(slices\.length === 0 \|\| total === 0\) return <p[^>]*>\{t\.noMoneyYet\}<\/p>/);
  });
});
