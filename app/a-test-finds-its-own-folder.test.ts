import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-10-25 — a test that reads source files finds them whatever the checkout is called.
 *
 * `new URL(import.meta.url).pathname` keeps the path PERCENT-ENCODED. On a checkout under a folder with a
 * space in its name — "Whatapp Project", which is where this repo lives on the author's Mac — it hands back
 * ".../Whatapp%20Project/...", `readFileSync` finds nothing, and the whole file fails to load. CI's path has
 * no space, so `phone-alerts.test.ts` was red for one person and green for everybody else, for weeks, and the
 * first instinct on seeing it was to wonder what had broken in the app.
 *
 * `fileURLToPath` is the decoded answer and the only correct way to turn a file URL into a path. This holds
 * every test in the repo to it, because the cost of the mistake is not a wrong result — it is an hour spent
 * looking for a bug that was never there.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...testFiles(full));
    else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

describe('a test that reads a source file', () => {
  const files = testFiles(here);

  it('finds plenty of tests to check, so a passing run means something', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never turns import.meta.url into a path with .pathname', () => {
    // Assembled rather than written out, so this file does not report itself.
    const wrongWay = new RegExp(['new URL\\(import', 'meta', 'url\\)', 'pathname'].join('\\.'));
    const self = fileURLToPath(import.meta.url);
    const guilty = files
      .filter((f) => f !== self && wrongWay.test(readFileSync(f, 'utf-8')))
      .map((f) => path.relative(here, f));
    expect(guilty).toEqual([]);
  });
});
