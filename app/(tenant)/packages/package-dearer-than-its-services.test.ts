import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-06 — a package priced above what its services cost on their own is asked about before it is saved.
 *
 * The API answers 409 `package_above_its_services` until the save is sent again with `confirmAboveServices: true`.
 * This pins the builder's half: the refusal becomes a question with both figures in it, "yes" finishes the save
 * that was in hand, and "no" leaves the form as it was. Source-reading, like the other client-component tests
 * here — there is no DOM in this suite.
 */
const builder = readFileSync(resolve(__dirname, 'PackageBuilder.tsx'), 'utf8');
const list = readFileSync(resolve(__dirname, 'PackagesList.tsx'), 'utf8');
const types = readFileSync(resolve(__dirname, '../lib/api-types.ts'), 'utf8');
const dictionary = readFileSync(resolve(__dirname, '../lib/api-messages.ts'), 'utf8');
const words = (file: string) =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../messages', file), 'utf8')).packages.builder.aboveServices as Record<string, string>;

describe('the builder', () => {
  it('turns the API’s question into a dialog instead of an error line', () => {
    const asked = builder.indexOf("err.code === 'package_above_its_services'");
    expect(asked).toBeGreaterThan(-1);
    expect(builder.slice(asked, asked + 120)).toMatch(/setAskingAbove\(\{ publish \}\);\s*return;/);
    // And it is tested before the generic message, or the question would be shown as a failure.
    expect(asked).toBeLessThan(builder.indexOf("t('errors.saveFailed'))"));
  });

  it('shows what the services come to and what the package is priced at', () => {
    expect(builder).toMatch(/t\('aboveServices\.body', \{\s*services: formatMoney\(String\(originalPriceMinor\)\),\s*price: formatMoney\(String\(comboPriceMinor\)\),/);
  });

  it('"yes" sends the same save again, with the same button’s intent, saying it is confirmed', () => {
    expect(builder).toMatch(/const \{ publish \} = askingAbove;\s*setAskingAbove\(null\);\s*void save\(publish, true\);/);
    expect(builder).toMatch(/\.\.\.\(confirmedAbove \? \{ confirmAboveServices: true \} : \{\}\),/);
  });

  it('"no" only closes the question — the form keeps everything typed', () => {
    expect(builder).toMatch(/onCancel=\{\(\) => setAskingAbove\(null\)\}/);
  });

  it('never says it is confirmed on the first try', () => {
    expect(builder).toMatch(/const save = async \(publish: boolean, confirmedAbove = false\) =>/);
    // Both buttons call it with one argument.
    expect(builder).toMatch(/onClick=\{\(\) => save\(true\)\}/);
    expect(builder).toMatch(/onClick=\{\(\) => save\(false\)\}/);
  });
});

describe('a copy made from the list', () => {
  it('repeats a price already decided, so it is not asked about from a list row', () => {
    const copy = list.slice(list.indexOf('const duplicate = async'), list.indexOf('const askToRemove'));
    expect(copy).toMatch(/active: false,/);
    expect(copy).toMatch(/confirmAboveServices: true,/);
  });
});

describe('the words', () => {
  it('exist in both languages, with both amounts and what "yes" will do', () => {
    for (const w of [words('en.json'), words('hi.json')]) {
      expect(w.body).toContain('{services}');
      expect(w.body).toContain('{price}');
      expect(w.confirm).toContain('{price}');
      expect(w.title).toBeTruthy();
      expect(w.cancel).toBeTruthy();
    }
    expect(words('en.json').cancel).toBe('Change the price');
  });

  it('the API’s own sentence has Hindi, for any screen that shows it as it is', () => {
    expect(dictionary).toContain("'This package costs more than its services do on their own. Check the price, or confirm it is right.':");
  });

  it('the input type carries the answer', () => {
    expect(types).toMatch(/confirmAboveServices\?: boolean;/);
  });
});
