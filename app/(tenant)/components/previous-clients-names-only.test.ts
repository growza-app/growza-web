import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-515 — the Previous clients list shows names only. The detail line under each name
 * (visits · branch) is gone from that list; search results and the other-branch rows keep theirs.
 */
const code = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the Previous clients list', () => {
  const start = code.indexOf('{(recent ?? []).map((c) => (');
  const recentRows = code.slice(start, code.indexOf('))}', start));

  it('shows the name and nothing under it', () => {
    expect(recentRows).toMatch(/picker-row-name/);
    expect(recentRows).not.toMatch(/picker-row-meta|clientMetaLine/);
  });

  it('still picks the client on tap', () => {
    expect(recentRows).toMatch(/onClick=\{\(\) => pickClient\(c\)\}/);
  });

  it('a one-line row is still a 44px target', () => {
    const css = readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8');
    expect(css).toMatch(/\.wi-row \{[^}]*min-height: 44px;/);
  });

  it('leaves the search results and the other-branch rows with their detail line', () => {
    const results = code.slice(code.indexOf('{results.map((c) => ('), code.indexOf('{!searching && results.length === 0'));
    expect(results).toMatch(/clientMetaLine\(c\)/);
    const elsewhere = code.slice(code.indexOf('{elsewhere.map((c) => ('));
    expect(elsewhere.slice(0, 700)).toMatch(/clientMetaLine\(c\)/);
  });
});
