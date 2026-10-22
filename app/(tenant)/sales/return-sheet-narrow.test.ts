import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Return product sheet's item table at 344px (Galaxy Z Fold closed).
 *
 * `10-tables-services-staff-pages.css` gives every bare `table` `min-width: 560px`. `.sls-ret-table` is stacked into
 * one block per product below 861px, but nothing reset that floor, so the block was 560px wide inside a 344px sheet,
 * `.sls-ret-table-wrap` clipped it, and only the labels (SKU, Purchased, …) showed — the values were in the DOM and
 * off-screen. It is the only way to return a counter sale from a shop's order screen (Jira GRW-615).
 *
 * These read the sources: the clip is a cascade fact (a floor in another file), and jsdom does no layout. The real
 * proof is the device matrix; this stops the lines that matter being tidied away.
 */
const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const css = here('../styles/99-sales.css');
const sheet = here('./ReturnProductSheet.tsx');

/** The body of the first `selector { … }` rule found in `source`. */
function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[2]!;
}

/** The `@media (query) { … }` block that holds `needle` — the sheet's CSS has several at the same width. */
function media(query: string, needle: string): string {
  for (let start = css.indexOf(`@media (${query}) {`); start >= 0; start = css.indexOf(`@media (${query}) {`, start + 1)) {
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) {
        const block = css.slice(start, i + 1);
        if (block.includes(needle)) return block;
        break;
      }
    }
  }
  throw new Error(`no @media (${query}) holding ${needle}`);
}

describe('Return product sheet item table at 344px', () => {
  const narrow = media('max-width: 860px', '.sls-ret-table thead');
  const blocks = '.sls-ret-table,\n  .sls-ret-table tbody,\n  .sls-ret-table tr';

  it('does not inherit the 560px floor every bare table has', () => {
    expect(rule(here('../styles/10-tables-services-staff-pages.css'), 'table')).toContain('min-width: 560px');
    expect(rule(css, '.sls-ret-table')).toMatch(/min-width:\s*0\s*;/);
  });

  it('keeps every block at the width of the sheet below 861px', () => {
    expect(rule(narrow, blocks)).toMatch(/display:\s*block/);
    expect(rule(narrow, blocks)).toMatch(/min-width:\s*0\s*;/);
    expect(rule(narrow, '.sls-ret-table thead')).toMatch(/display:\s*none/);
  });

  it('stacks each cell as a label on the left and its value on the right', () => {
    const td = rule(narrow, '.sls-ret-table td');
    expect(td).toMatch(/display:\s*flex/);
    expect(td).toMatch(/justify-content:\s*space-between/);
    expect(rule(narrow, '.sls-ret-table td::before')).toContain('content: attr(data-label)');
  });

  it('gives every cell a label to show, so no value stands alone', () => {
    const cells = sheet.match(/<td\b[^>]*>/g) ?? [];
    // Six columns: product, SKU, purchased, already returned, return now, refund amount.
    expect(cells.length).toBe(6);
    for (const c of cells) expect(c).toContain('data-label=');
  });

  it('makes the 44px targets: each stacked row, the tick box around its checkbox, and the stepper', () => {
    expect(rule(narrow, '.sls-ret-table td')).toMatch(/min-height:\s*2\.75rem/);
    const pick = rule(narrow, '.sls-ret-pick');
    expect(pick).toMatch(/width:\s*2\.75rem/);
    expect(pick).toMatch(/height:\s*2\.75rem/);
    expect(rule(narrow, '.sls-ret-step-btn')).toMatch(/width:\s*44px[\s\S]*height:\s*44px/);
    // A native checkbox ignores padding, so the label around it is what makes the target.
    expect(sheet).toMatch(/<label className="sls-ret-pick">\s*<input\s+type="checkbox"\s+className="sls-ret-checkbox"/);
  });

  it('lets the table scroll sideways from 861px rather than clip its last columns', () => {
    const wrap = rule(css, '.sls-ret-table-wrap');
    expect(wrap).toMatch(/overflow-x:\s*auto/);
    expect(wrap).not.toMatch(/overflow:\s*hidden/);
  });

  it('lets a long product name use the whole row, left-aligned, instead of a 14rem column', () => {
    const name = rule(narrow, '.sls-ret-line-name');
    expect(name).toMatch(/max-width:\s*none/);
    expect(name).toMatch(/text-align:\s*left/);
  });

  it('sets what it adds in rem and Growza spacing tokens, not px font sizes', () => {
    const added = [narrow, rule(css, '.sls-ret-table-wrap'), rule(css, '.sls-ret-pick')].join('\n');
    expect(added).not.toMatch(/font-size:\s*\d+px/);
  });
});
