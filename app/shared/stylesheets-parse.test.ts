import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * Every stylesheet in the dashboard parses.
 *
 * 10 Nov 2026 — four stories each appended a block to the end of admin.css; a merge kept both sides of each conflict
 * and git interleaved them, leaving four rules unclosed. Every unit test still passed, because none of them reads
 * CSS as CSS — and the dashboard would not build. A stylesheet that does not parse is caught here now.
 */
const root = join(__dirname, '..');
const sheets: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith('.css')) sheets.push(p);
  }
};
walk(root);

describe('stylesheets', () => {
  it('there are some to check', () => {
    expect(sheets.length).toBeGreaterThan(0);
  });

  for (const sheet of sheets) {
    it(`${sheet.slice(root.length + 1)} parses, with no merge markers left in it`, () => {
      const css = readFileSync(sheet, 'utf8');
      expect(css).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
      expect(() => postcss.parse(css, { from: sheet })).not.toThrow();
    });
  }
});
