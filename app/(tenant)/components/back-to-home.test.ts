import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-523 — the plus opens New booking as a page, and the page's first screen ends with a secondary
 * "Back to home page" button that goes to Home. Page presentation only: the sheet (Record payment) has none.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));

describe('Back to home page', () => {
  it('is a secondary button under Continue, on the page presentation only, going to Home', () => {
    const first = sheet.slice(sheet.indexOf('nv.useThisPerson'));
    expect(first.slice(0, 600)).toMatch(
      /\{asPage \? \(\s*<button type="button" className="btn btn-ghost wi-act-alt" onClick=\{\(\) => router\.push\('\/'\)\}>\s*\{nv\.backToHome\}/,
    );
  });

  it('has its words in both languages', () => {
    for (const lang of ['en', 'hi']) {
      const m = readFileSync(resolve(__dirname, `../../../messages/${lang}.json`), 'utf8');
      expect(m).toMatch(/"backToHome": "[^"]+"/);
    }
  });

  it('the plus no longer mounts a sheet', () => {
    const chrome = readFileSync(resolve(__dirname, 'MobileChrome.tsx'), 'utf8');
    expect(chrome).not.toMatch(/<NewVisitSheet/);
  });
});
