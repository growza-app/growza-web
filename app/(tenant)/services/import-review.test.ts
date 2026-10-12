import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { Draft } from './import-drafts';
import { ImportReview } from './ImportReview';
import { firstProblem, matchesFilter, reviewCounts, reviewGroups, reviewRows } from './import-review';

const draft = (over: Partial<Draft> = {}): Draft => ({
  name: 'Haircut',
  categoryName: 'Hair',
  durationMin: '45',
  bufferAfterMin: '',
  price: '500',
  existing: null,
  skip: false,
  ...over,
});

const drafts = [
  draft({ name: 'Haircut' }),
  draft({ name: 'Facial', categoryName: 'Skin', price: '1200' }),
  draft({ name: 'Blow dry', price: 'abc' }), // not a number → blocks
  draft({ name: 'Wax', categoryName: 'Skin', durationMin: '', price: '300' }), // no minutes → blocks
  draft({ name: 'Old one', categoryName: 'Skin', skip: true, price: 'abc' }), // skipped, so it does not block
  draft({ name: 'Spa', categoryName: '', price: '900' }),
];

const render = (locale: 'en' | 'hi', ds: Draft[]) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(ImportReview, {
        branchId: 'b1',
        drafts: ds,
        setDrafts: () => {},
        onBack: () => {},
        onImported: () => {},
        lookup: () => null,
      }),
    }),
  );

describe('what needs the owner, and what does not', () => {
  const rows = reviewRows(drafts);

  it('counts the rows that block the import — and not a skipped one', () => {
    const c = reviewCounts(rows);
    expect(c).toMatchObject({ all: 6, fix: 2, skipped: 1, existing: 0 });
    expect(rows.find((r) => r.draft.name === 'Old one')!.issue).toBeNull();
  });

  it('filters to exactly those rows', () => {
    expect(rows.filter((r) => matchesFilter(r, 'fix')).map((r) => r.draft.name)).toEqual(['Blow dry', 'Wax']);
    expect(rows.filter((r) => matchesFilter(r, 'skipped')).map((r) => r.draft.name)).toEqual(['Old one']);
  });

  it('groups by the mapped category, in file order, with a group for none', () => {
    expect(reviewGroups(rows).map((g) => [g.name, g.rows.length])).toEqual([
      ['Hair', 2],
      ['Skin', 3],
      ['', 1],
    ]);
  });

  it('finds the first blocking row for the button to jump to', () => {
    expect(firstProblem(rows)).toBe(2);
    expect(firstProblem(reviewRows([draft()]))).toBe(-1);
  });
});

describe('the review, as the owner sees it', () => {
  it('shows rows as text with the problems named, not 6 sets of inputs', () => {
    const html = render('en', drafts);
    expect(html).toContain('45 min · ₹500');
    expect(html).toContain('Price is not a number');
    expect(html).toContain('Needs how long it takes');
    // Only the two blocking rows are open: two name, two minutes, two price fields.
    expect(html.match(/rv-edit/g)).toHaveLength(2);
  });

  it('offers Needs fixing with its count, and says what the button is waiting on', () => {
    const html = render('en', drafts);
    expect(html).toMatch(/Needs fixing <b>2<\/b>/);
    expect(html).toContain('Fix 2 rows first');
    expect(html).toContain('Skipped <b>1</b>');
  });

  it('is just the list and an Import button when nothing needs fixing', () => {
    const html = render('en', [draft(), draft({ name: 'Facial' })]);
    expect(html).not.toContain('Needs fixing');
    expect(html).not.toContain('rv-edit');
    expect(html).toContain('Import 2');
  });

  /** The field is the service's NAME: "Service" alone, over a box holding "Haircut", read as the category. */
  it('labels the name field as a name, in both languages', () => {
    const bad = [draft({ name: 'Wax', durationMin: '' })];
    expect(render('en', bad)).toContain('field-label">Service name<');
    expect(render('hi', bad)).toContain('field-label">सेवा का नाम<');
  });

  it('groups under the category, with a count', () => {
    const html = render('en', drafts);
    expect(html).toContain('rv-group-name">Hair<');
    expect(html).toContain('rv-group-name">No category<');
  });

  it('is translated, not left in English', () => {
    const html = render('hi', drafts);
    expect(html).toContain('ठीक करना है');
    expect(html).toContain('बिना श्रेणी');
    for (const english of ['Needs fixing', 'No category', 'Skipped']) expect(html, english).not.toContain(english);
  });
});
