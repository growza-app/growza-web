import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-537 — the first screen of New booking, as a page, has Back in the header. The header seat for it
 * was already there (GRW-458) but only the later steps filled it, so the first screen showed an empty 44px gap.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const goBack = sheet.slice(sheet.indexOf('const goBack = (() => {'), sheet.indexOf('return (\n    <>', sheet.indexOf('const goBack = (() => {')));

describe('New booking first screen has Back', () => {
  it("goes back through history, or Home when there is none — the app's own Back", () => {
    expect(goBack).toMatch(/asPage && stage\.step === 'client'/);
    expect(goBack).toMatch(/window\.history\.length > 1 \? router\.back\(\) : router\.push\('\/'\)/);
  });

  it('is only on the page, never in the pop-up (which has its close button)', () => {
    expect(goBack).toMatch(/if \(asPage && stage\.step === 'client'\)/);
  });

  it('is still switched off mid-save, before anything else', () => {
    expect(goBack.indexOf('if (busy || linesLocked) return null;')).toBeLessThan(goBack.indexOf("asPage && stage.step === 'client'"));
  });

  it('the later steps still go back a step', () => {
    expect(goBack).toMatch(/setStage\(\{ step: 'client' \}\)/);
    expect(goBack).toMatch(/setStage\(\{ step: 'details', client \}\)/);
  });
});
