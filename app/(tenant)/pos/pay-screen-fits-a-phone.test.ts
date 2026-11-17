import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Owner, 2026-11-17 — "it should fit in single screen; the payment tiles are too big". */
const css = readFileSync(resolve(__dirname, '../styles/73-pay-flow.css'), 'utf8');
const phone = css.slice(css.lastIndexOf('@media (max-width: 639px) {'));

describe('the payment screen fits one phone screen', () => {
  it('draws the four ways to pay as compact 56px tiles, icon beside the word, normal case', () => {
    expect(phone).toContain('min-height: 56px;');
    expect(phone).toContain('text-transform: none;');
  });
  it('keeps the hint line for a screen reader only, tightens the total, and puts points on one line', () => {
    expect(phone).toMatch(/\.pf-pay-sub \{\n    position: absolute;[\s\S]*clip: rect\(0 0 0 0\);/);
    expect(phone).toContain('.pf > .pf-redeem.is-ready .pf-redeem-have {\n    display: none;');
  });
});
