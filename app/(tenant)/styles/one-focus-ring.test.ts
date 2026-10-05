import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-490 — a control gets one focus ring, and it goes on the box people can see.
 *
 * `90-accessibility.css` forces a ring on every `input` with `!important`, deliberately: before GRW-342 a field
 * drew one only if its own stylesheet remembered to, and several did not. The cost is that a BARE input — one
 * whose stylesheet takes its border away because a wrapper around it carries the visible box — draws that ring
 * hugging the input, inside the wrapper's border. The owner saw it on the checkout amount field: a green
 * rectangle around "300", inside the grey pill, with the ₹ outside it.
 *
 * GRW-425 fixed the search bar and left the explanation in `26-search.css`; it did not sweep the rest. This
 * test is the sweep made permanent: find every input whose own rule drops its border, and insist it either
 * belongs to a wrapper that takes the ring instead, or is a field that is itself the box.
 */
/**
 * Where a cell's ring actually lives, when it is not the cell itself.
 *
 * The service sheet's rows hold their field in a cell (`.sheet-row-price` is on the row, `.sheet-row-value` is
 * a child of it) but the box a reader would point at is the ROW, with its divider — so `.sheet-row` takes the
 * ring for both. Nothing in the CSS says these belong together, so it is said here.
 */
const RING_LIVES_ON: Record<string, string> = {
  'sheet-row-price': 'sheet-row',
  'sheet-row-value': 'sheet-row',
};

const dir = resolve(__dirname);
const read = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const sheets = readdirSync(dir).filter((f) => f.endsWith('.css'));
const a11y = read('90-accessibility.css');

/** Every rule whose selector names an `input` and whose body takes the border away. */
function bareInputRules(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]*\b(?:input|select|textarea)\b[^{}]*)\{([^}]*)\}/g)) {
    if (/border(-\w+)?:\s*(none|0)\b/.test(m[2]!)) out.push(m[1]!.trim().replace(/\s+/g, ' '));
  }
  return out;
}

/**
 * The field's NEAREST wrapper — the class right before it, not the first one in the selector.
 * `.wi-picked-row .wi-amount input` → `wi-amount`, because `.wi-amount` is the box with the border.
 */
function wrapperOf(selector: string): string | null {
  const first = selector.split(',')[0]!.trim();
  const parts = first.split(/\s+/);
  const at = parts.findIndex((p) => /\b(input|select|textarea)\b/.test(p));
  if (at < 1) return null;
  const head = parts[at - 1]!;
  return head.startsWith('.') ? head.split(/[.:[]/).filter(Boolean)[0]! : null;
}

describe('one focus ring per control', () => {
  it('the forced ring is still there — if it goes, this whole file can go with it', () => {
    expect(a11y).toMatch(/input:focus-visible,\s*select:focus-visible,\s*textarea:focus-visible \{\s*outline: 2px solid var\(--accent-deep\) !important;/);
  });

  /*
   * A bare input is only allowed if something else draws its ring. Two ways are permitted:
   * its wrapper opts it out here (GRW-490), or its own sheet does (GRW-425's search bar).
   */
  for (const sheet of sheets) {
    const css = read(sheet);
    for (const selector of bareInputRules(css)) {
      const cell = wrapperOf(selector);
      if (!cell) continue; // a field that IS the box keeps the forced ring, correctly
      const wrapper = RING_LIVES_ON[cell] ?? cell;
      it(`${sheet}: ${selector} gives its ring to .${wrapper}`, () => {
        const optedOut = new RegExp(`\\.${wrapper}[^,{}]*(input|select|textarea)[^,{}]*:focus-visible[^{]*\\{[^}]*outline:\\s*0\\s*!important`);
        const hasRing = new RegExp(`\\.${wrapper}[^,{}]*:focus-within`);
        expect({ sel: selector, optedOut: optedOut.test(a11y) || optedOut.test(css) }).toEqual({ sel: selector, optedOut: true });
        expect({ sel: selector, ring: hasRing.test(a11y) || hasRing.test(css) }).toEqual({ sel: selector, ring: true });
      });
    }
  }

  it('the wrappers that took it on use the baseline colour, not a second one', () => {
    // --accent is 2.76:1 on white, under WCAG 1.4.11's 3:1 for a focus indicator; --accent-deep is 7.8:1.
    const block = a11y.slice(a11y.indexOf('.checkout-amount-field:focus-within'));
    expect(block.slice(0, 600)).toMatch(/outline: 2px solid var\(--accent-deep\);/);
  });
});
