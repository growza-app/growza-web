import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-270 · GRW-275 — how the money came in, under the amount, on a phone.
 *
 * The ⋯ menu used to swap the card between totals and the payment split, so a
 * phone never showed both. The split is now always rendered, and the full list
 * opens from the payment line's "+N" (Jira GRW-394 removed the ⋯ button, which
 * repeated the line). Checked in a browser at 320–1440px; these pin the markup.
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

  it('AC-02 — the full list shows the same split, with the total, and only "+N" opens it', () => {
    const menu = hero.slice(hero.indexOf('hm-pay-menu'));
    expect(menu).toMatch(/rupees\(money\.revenueMinor\)/);
    expect(menu).toMatch(/<PaymentBar t=\{t\} slices=\{money\.byPaymentMode\} total=\{money\.revenueMinor\} variant="list" \/>/);
    // Jira GRW-394 — no ⋯ button repeating the payment line; the line's "+N" is the way in.
    expect(hero).not.toMatch(/hm-hero-menu/);
    expect(hero).toMatch(/<PaymentLine t=\{t\} slices=\{money\.byPaymentMode\} total=\{money\.revenueMinor\} onMore=\{\(\) => setMenu\(true\)\} \/>/);
  });

  it('Jira GRW-394 — the branch line is one row: a long branch name is cut, never an amount, and "+N" does not wrap', () => {
    const css = readFileSync(resolve(__dirname, '../../styles/86-money-card-phone.css'), 'utf8');
    expect(hero).toMatch(/<div className="hm-line hm-line-branches" role="group" aria-label=\{t\.yourBranches\}>/);
    expect(css).toMatch(/\.hm-line-branches \{\s*flex-wrap: nowrap;/);
    // The amounts keep their size: `.hm-line b` never shrinks, only the name does (ellipsis).
    expect(css).toMatch(/\.hm-line b \{\s*flex: none;/);
    expect(css).toMatch(/\.hm-line-name \{[^}]*text-overflow: ellipsis;/);
  });

  it('AC-03 — nothing taken yet reads as words, not an empty bar', () => {
    expect(hero).toMatch(/if \(slices\.length === 0 \|\| total === 0\) return <p[^>]*>\{t\.noMoneyYet\}<\/p>/);
  });
});
