import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-698 — admin text grows with the reader's text size and is never under 12px. Type is set in rem (CLAUDE.md,
 * Jira GRW-481); a number or a px font size in app/admin is the bug this file catches.
 */
const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts|css)$/.test(n) && !n.includes('.test.')) files.push(p);
  }
};
walk(__dirname);

describe('admin type is in rem', () => {
  it('AC-01 — no inline numeric or px font size, and no px font-size in the stylesheet', () => {
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/fontSize: [^,}\n]*\b\d+(\.\d+)?(?!\d*\.?\d*rem)(px)?\b(?!rem)/.test(line) && !/fontSize: [^,}\n]*rem'/.test(line)) offenders.push(`${f}:${i + 1}`);
          if (/font-size:\s*\d+(\.\d+)?px/.test(line)) offenders.push(`${f}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('AC-02 — nothing is set below 0.75rem (12px)', () => {
    const tiny: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:fontSize: [^,}\n]*?'|font-size:\s*)(\d*\.?\d+)rem/g)) {
        if (Number(m[1]) < 0.75) tiny.push(`${f}: ${m[0]}`);
      }
    }
    expect(tiny).toEqual([]);
  });
});
