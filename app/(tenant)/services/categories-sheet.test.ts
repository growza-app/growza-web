import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ServiceCategoryAdmin } from '../lib/api';
import { CategoriesSheet } from './CategoriesSheet';

/**
 * Jira GRW-428 — the category sheet, rendered from the real component in both languages.
 *
 * What is worth pinning here is not that it renders: it is the counting, which is the one place this screen can
 * mislead. `serviceCount` includes retired services because it is what a delete sets loose; `activeCount` is
 * what is on the menu. A row that showed only the active count would promise an owner that deleting a category
 * frees three services when it frees five.
 */
const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: child }),
  );

const cat = (over: Partial<ServiceCategoryAdmin>): ServiceCategoryAdmin => ({
  id: 'c1',
  name: 'Hair',
  sortOrder: 1,
  serviceCount: 10,
  activeCount: 10,
  ...over,
});

const sheet = (locale: 'en' | 'hi', rows: ServiceCategoryAdmin[]) =>
  wrap(
    locale,
    createElement(CategoriesSheet, { branchId: 'b1', initial: rows, onClose: () => {}, onChanged: () => {} }),
  );

describe('the categories sheet', () => {
  it('counts every service a delete would set loose, retired ones included', () => {
    const html = sheet('en', [
      cat({ id: 'a', name: 'Hair', serviceCount: 10, activeCount: 10 }),
      cat({ id: 'b', name: 'Bridal', serviceCount: 5, activeCount: 3 }),
      cat({ id: 'c', name: 'Nails', serviceCount: 0, activeCount: 0 }),
    ]);
    expect(html).toContain('10 services');
    // Five, not three: two are retired, and both are still filed under Bridal.
    expect(html).toContain('5 services');
    expect(html).toContain('2 retired');
    expect(html).toContain('No services yet');
  });

  it('says one service, not 1 services', () => {
    expect(sheet('en', [cat({ serviceCount: 1, activeCount: 1 })])).toContain('1 service<');
  });

  it('offers to add a category when the branch has none', () => {
    const html = sheet('en', []);
    expect(html).toContain('You have no categories yet');
    expect(html).toContain('New category name');
  });

  /** Reordering is the two arrows; the ends of the list cannot move past themselves. */
  it('disables the arrow that would move a row off the end', () => {
    const html = sheet('en', [cat({ id: 'a', name: 'Hair' }), cat({ id: 'b', name: 'Nails' })]);
    const up = html.indexOf('Move Hair up');
    const down = html.indexOf('Move Nails down');
    expect(up).toBeGreaterThan(-1);
    expect(down).toBeGreaterThan(-1);
    // The disabled attribute sits before the label in the rendered button tag.
    expect(html.slice(Math.max(0, up - 120), up)).toContain('disabled');
    expect(html.slice(Math.max(0, down - 120), down)).toContain('disabled');
    expect(html.slice(Math.max(0, html.indexOf('Move Nails up') - 120), html.indexOf('Move Nails up'))).not.toContain('disabled');
  });

  /** The destructive action is last in the row, where a thumb reaches it only on purpose. */
  it('puts Delete after the arrows and the rename', () => {
    const html = sheet('en', [cat({ name: 'Hair' })]);
    expect(html.indexOf('Rename Hair')).toBeLessThan(html.indexOf('Delete'));
  });

  it('reads in Hindi', () => {
    const html = sheet('hi', [cat({ name: 'Hair', serviceCount: 10, activeCount: 10 }), cat({ id: 'z', name: 'Nails', serviceCount: 0, activeCount: 0 })]);
    expect(html).toContain('श्रेणियाँ');
    expect(html).toContain('10 सेवाएँ');
    expect(html).toContain('अभी कोई सेवा नहीं');
    expect(html).toContain('नई श्रेणी का नाम');
    for (const s of ['New category name', 'No services yet', '10 services']) expect(html, s).not.toContain(s);
  });
});
