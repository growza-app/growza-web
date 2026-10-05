import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-513 — Search shows ONE Back arrow on a phone.
 *
 * Every header wears Back on a phone since GRW-497, and Search's own row also began with a Back link
 * (GRW-307): two arrows, one above the other. The row's goes below 861px; from there up the header has no
 * Back and the row's is the only way out, so it stays.
 */
const css = readFileSync(resolve(__dirname, '../styles/26-search.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const client = readFileSync(resolve(__dirname, 'SearchClient.tsx'), 'utf8');

describe("Search's second Back arrow", () => {
  it('is hidden on a phone only', () => {
    expect(css).toMatch(/@media \(max-width: 860px\) \{\s*\.srch-bar-row \.icon-btn \{\s*display: none;/);
  });

  it('is still in the markup, for the laptop', () => {
    expect(client).toMatch(/<a className="icon-btn" href="\/" aria-label=\{t\('back'\)\}>/);
  });
});
