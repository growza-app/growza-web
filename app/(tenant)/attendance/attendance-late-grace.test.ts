import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-63 · GRW-170 — the late-grace setting travels all the way to the
 * screen that acts on it. The API half (saved, handed to the register) stays in
 * test/platform/attendance-late-grace.test.ts; this screen half moved here with
 * Jira GRW-370 so the API's tests no longer read dashboard files.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, rel), 'utf-8');

describe('the attendance register', () => {
  it('and the screen compares against shift start PLUS it, never the bare start', () => {
    /**
     * The assertion the whole setting exists for. `> minutesOf(shiftStart)`
     * alone is the strict-to-the-minute rule this replaced; if it comes back,
     * the setting still saves, still displays, and stops doing anything.
     *
     * Comments are stripped first — an assertion that cannot tell code from
     * prose ABOUT the code is not asserting about the code, a mistake made
     * twice in this repo already.
     */
    const screen = read('AttendanceRegister.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // Jira GRW-230 — the grace is the stylist's branch's when it has its own, else the business's.
    expect(screen).toMatch(/minutesOf\(row\.shiftStart\) \+ \(register\.lateGraceByProvider\?\.\[row\.providerId\] \?\? register\.lateGraceMin\)/);
    expect(screen).not.toMatch(/minutesOf\(value\) > minutesOf\(row\.shiftStart\)/);
  });
});
