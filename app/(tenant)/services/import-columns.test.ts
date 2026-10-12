import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { ImportColumns } from './ImportColumns';
import { fieldAt, matchedAll, missingRequired, samplesFor, suggest, withColumnAs } from './import-columns';

/**
 * The step where the owner says which column of their file is which. What can go wrong is quiet: a column
 * counted as two things, a required one missing without a word, or a screen that interrogates a file it
 * already understood.
 */
const headers = ['Service name', 'Type', 'Minutes', 'Cleanup after', 'Price', 'Notes'];
const rows = [
  ['Haircut', 'Hair', '45', '5', '₹500', ''],
  ['Facial', 'Skin', '60', '10', '₹1,200', 'ask for Rina'],
  ['Haircut', 'Hair', '30', '', '', ''],
];

const view = (locale: 'en' | 'hi', hdrs: string[], map = suggest(hdrs)) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(ImportColumns, { headers: hdrs, rows, map, onMap: () => {}, onBack: () => {}, onNext: () => {} }),
    }),
  );

describe('which column becomes what', () => {
  it('reads a conventionally named sheet without being asked', () => {
    const map = suggest(headers);
    expect(fieldAt(map, 0)).toBe('name');
    expect(fieldAt(map, 1)).toBe('categoryName');
    expect(fieldAt(map, 2)).toBe('durationMin');
    expect(fieldAt(map, 5)).toBeNull();
    expect(matchedAll(map)).toBe(true);
  });

  it('moves a field rather than reading it from two columns', () => {
    const map = suggest(headers);
    const next = withColumnAs(map, 5, 'priceMinor');
    expect(next.priceMinor).toBe(5);
    expect(fieldAt(next, 4)).toBeNull();
    expect(Object.values(next).filter((i) => i === 5)).toHaveLength(1);
  });

  it('lets a column be skipped', () => {
    const next = withColumnAs(suggest(headers), 2, null);
    expect(fieldAt(next, 2)).toBeNull();
    expect(missingRequired(next)).toEqual(['durationMin']);
  });

  it('shows what is in a column — distinct, non-empty, cut short', () => {
    expect(samplesFor(rows, 0)).toEqual(['Haircut', 'Facial']);
    expect(samplesFor(rows, 5)).toEqual(['ask for Rina']);
    expect(samplesFor([['x'.repeat(40)]], 0)[0]).toHaveLength(24);
    expect(samplesFor(rows, 9)).toEqual([]);
  });
});

describe('the step, as the owner sees it', () => {
  it('confirms in one short list when everything required was found', () => {
    const html = view('en', headers);
    expect(html).toContain('matched your columns');
    expect(html).toContain('import-matched');
    expect(html).toContain('Change');
    expect(html).toContain('Not used: Notes');
    expect(html).not.toContain('import-cols');
    expect(html).not.toContain('<select');
  });

  /** The label is the owner's own column name, character for character — not our word for it. */
  it('labels each line with the column exactly as it is named in their file', () => {
    const odd = ['Treatment', 'Labour hrs', 'Rate (INR)'];
    const html = view('en', odd);
    for (const name of odd) expect(html, name).toContain(`import-matched-col">${name}<`);
    // …and what it becomes is the value beside it, not the label.
    expect(html).toMatch(/import-matched-col">Labour hrs<\/span><span class="import-matched-becomes">Minutes</);
  });

  it('opens a card per column, with samples, when a required column is missing', () => {
    const html = view('en', ['Item', 'When', 'Cost']);
    expect(html).toContain('import-cols');
    expect(html).toContain('Choose which column holds how long it takes');
    expect(html).toContain('Becomes');
    expect(html).toContain('Skip this column');
    expect(html).toContain('Haircut · Facial');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Check 3 rows/);
  });

  it('names the fields in plain words — Category, not Type', () => {
    const html = view('en', ['Item', 'When', 'Cost']);
    expect(html).toContain('>Category');
    expect(html).not.toContain('>Type<');
    expect(html).toContain('Service name (needed)');
  });

  it('is translated, not left in English', () => {
    const matched = view('hi', headers);
    expect(matched).toContain('बदलें');
    expect(matched).not.toContain('Change');
    const asked = view('hi', ['Item', 'When', 'Cost']);
    expect(asked).toContain('यह बनेगा');
    expect(asked).toContain('यह कॉलम छोड़ें');
    for (const english of ['Becomes', 'Skip this column', 'Choose which column']) expect(asked, english).not.toContain(english);
  });
});
