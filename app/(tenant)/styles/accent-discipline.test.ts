import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Accent discipline (2026-10-14) — five colours, one meaning each, every one a token in 00-base.css.
 * Before this, red alone was written as a raw hex 50 times across 25 sheets (#b91c1c, #991b1b, #c0362c,
 * four different pinks); a new sheet copied whichever it saw last. This pins the rule: a red, amber,
 * green, blue or purple is `var(--…)`, never a hex, anywhere but the token sheet.
 */
const dir = join(__dirname);
const sheets = readdirSync(dir).filter((f) => f.endsWith('.css') && f !== '00-base.css');
const base = readFileSync(join(dir, '00-base.css'), 'utf8');

/* The exact values that used to be written raw. A sheet that needs one of these colours uses its token. */
const RETIRED = [
  'b91c1c', '991b1b', 'c0362c', 'c53434', 'c53b3b', 'ef4444', 'dc2626', 'fde4e4', 'fde3e3', 'fde8e8', 'fdeaea', 'fef2f2', 'fdecec', 'fecaca',
  '92400e', '8a5a0f', '7a4f0c', 'fbf0dc', 'fdf0d5', 'fdf3e3',
  '16a34a', 'dcf8e7', 'e7f6ee', '166534', '14532d',
  '2563eb', '1d4ed8', 'dbe8fe', 'e6effe', 'e8effd',
  '6d4fc4', '6d28d9', '7c3aed', 'e6e0fa', 'efe9fb', 'efebfb',
];
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\("data:[^"]*"\)/g, '');

describe('accent discipline', () => {
  it('00-base.css defines the five families', () => {
    for (const t of ['--accent', '--accent-soft', '--accent-deep', '--amber', '--amber-soft', '--amber-ink', '--danger', '--danger-deep', '--danger-soft', '--danger-line', '--blue', '--blue-soft', '--purple', '--purple-soft', '--purple-deep']) {
      expect(base, t).toMatch(new RegExp(`^\\s*${t}:\\s*#[0-9a-f]{6};`, 'm'));
    }
  });

  it('no sheet writes a red, amber, green, blue or purple as a raw hex', () => {
    const found: string[] = [];
    for (const f of sheets) {
      const css = strip(readFileSync(join(dir, f), 'utf8'));
      for (const hex of RETIRED) if (new RegExp(`#${hex}\\b`, 'i').test(css)) found.push(`${f}: #${hex}`);
    }
    expect(found).toEqual([]);
  });

  it('the inline error colour in a component is the danger token, not a hex', () => {
    const comps = ['../components/BookingSummary.tsx', '../components/BookingSheet.tsx', '../components/CheckoutSheet.tsx', '../components/home/parts.tsx'];
    for (const c of comps) expect(readFileSync(join(dir, c), 'utf8'), c).not.toMatch(/#(b91c1c|c0362c|8a5a0f|6d4fc4|16794a)/i);
  });
});
