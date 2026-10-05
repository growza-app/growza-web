import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-522 — "Which branch?" in New booking is a dropdown, not a row of chips (which wrapped to three
 * lines with five branches). Same rules as before: shown only while the branch is still open to change, the
 * branch's menu/stylist/chair clear with it, and it is locked while saving.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const css = strip(readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8'));

describe('Which branch?', () => {
  const block = sheet.slice(sheet.indexOf('{branches.length > 1 && !branchSettled ? ('), sheet.indexOf('<BookAgainCard'));

  it('is a select with every branch as an option, the first labelled Main', () => {
    expect(block).toMatch(/<select\s+id="wi-branch"\s+value=\{branchId \?\? ''\}/);
    expect(block).toMatch(/<label htmlFor="wi-branch">\{nv\.whichBranch\}<\/label>/);
    expect(block).toMatch(/\{branches\.map\(\(b, i\) => \(\s*<option key=\{b\.id\} value=\{b\.id\}>\s*\{i === 0 \? tw\('mainSuffix', \{ name: b\.name \}\) : b\.name\}/);
  });

  it('keeps its rules: marks the branch as touched, sets it, and is locked while saving', () => {
    expect(block).toMatch(/branchTouched\.current = true;\s*setBranchId\(e\.target\.value\);/);
    expect(block).toMatch(/disabled=\{busy \|\| linesLocked\}/);
  });

  it('is gone as chips', () => {
    expect(block).not.toMatch(/role="radiogroup"|wi-chip/);
  });

  it('fits a narrow phone: full width, 44px, a long name cut with an ellipsis', () => {
    expect(css).toMatch(/\.wi-branch-field select \{\s*width: 100%;\s*min-width: 0;\s*min-height: 44px;\s*box-sizing: border-box;\s*text-overflow: ellipsis;/);
  });
});
