import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ServiceAdmin, ServiceCategoryAdmin } from '../lib/api';
import { CategoriesSheet } from './CategoriesSheet';
import { CategoryServices } from './CategoryServices';
import { CategoryDeleteCard } from './CategoryDeleteCard';

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

const sheet = (locale: 'en' | 'hi', rows: ServiceCategoryAdmin[], services: ServiceAdmin[] = []) =>
  wrap(
    locale,
    createElement(CategoriesSheet, { branchId: 'b1', initial: rows, services, onClose: () => {}, onChanged: () => {} }),
  );

const svc = (over: Partial<ServiceAdmin>): ServiceAdmin =>
  ({
    id: 's1',
    name: 'Blow dry',
    categoryId: 'a',
    categoryName: 'Hair',
    durationMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    priceMinor: '40000',
    currency: 'INR',
    imageUrl: null,
    active: true,
    ...over,
  }) as ServiceAdmin;

/** The category opened into its services. Rendered statically, so this is the nothing-selected state. */
const detail = (locale: 'en' | 'hi', services: ServiceAdmin[]) =>
  wrap(
    locale,
    createElement(CategoryServices, {
      branchId: 'b1',
      category: cat({ id: 'a', name: 'Hair', serviceCount: services.length, activeCount: services.filter((s) => s.active).length }),
      services,
      onBack: () => {},
      onChanged: () => {},
    }),
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

  /**
   * Nothing destructive lives on the list row any more (owner's change, 2026-10-02): the row opens the
   * category, and removing services — or the category with them — happens in there against a selection.
   */
  it('offers no delete on the row itself', () => {
    const html = sheet('en', [cat({ name: 'Hair' })]);
    expect(html).not.toContain('Delete');
    expect(html).toContain('Rename Hair');
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

describe('a category opened into its services', () => {
  it('is a plain list, with the way to remove things at the top', () => {
    const html = detail('en', [svc({}), svc({ id: 's2', name: 'Keratin' })]);
    expect(html).toContain('Blow dry');
    expect(html).toContain('Keratin');
    expect(html).toContain('Delete');
    // The ticking is behind that button, not on the list itself (owner's change, 2026-10-02).
    expect(html).not.toContain('svc-pick-mark');
    expect(html).not.toContain('selected');
  });

  it('shows a retired service with its badge, because the owner is looking at the whole category', () => {
    const html = detail('en', [svc({}), svc({ id: 's2', name: 'Keratin', active: false })]);
    expect(html).toContain('Retired');
    expect(html).toContain('is-retired');
  });

  it('says the duration and price of each service', () => {
    const html = detail('en', [svc({ durationMin: 45, priceMinor: '90000' })]);
    expect(html).toContain('45 min');
    expect(html).toContain('900');
  });

  it('says so when nothing is filed under it', () => {
    expect(detail('en', [])).toContain('Nothing is filed under this category yet');
  });

  it('reads in Hindi', () => {
    const html = detail('hi', [svc({})]);
    expect(html).toContain('श्रेणियाँ');
    expect(html).toContain('हटाएँ');
    expect(html).not.toContain('Delete');
  });
});

describe('the delete card', () => {
  const card = (locale: 'en' | 'hi', services: ServiceAdmin[]) =>
    wrap(
      locale,
      createElement(CategoryDeleteCard, {
        branchId: 'b1',
        category: cat({ id: 'a', name: 'Hair', serviceCount: services.length, activeCount: services.filter((s) => s.active).length }),
        services,
        onClose: () => {},
        onDone: () => {},
      }),
    );

  it('asks for a selection before it will do anything', () => {
    const html = card('en', [svc({}), svc({ id: 's2', name: 'Keratin' })]);
    expect(html).toContain('Delete from Hair');
    expect(html).toContain('Pick what to take off the menu');
    const action = html.indexOf('Pick what to take off the menu');
    expect(html.slice(Math.max(0, action - 200), action)).toContain('disabled');
  });

  /** The trap this wording exists to avoid: a "select all" that silently also deletes the category. */
  it('says what Select all costs, before it is ticked', () => {
    const html = card('en', [svc({})]);
    expect(html).toContain('Select all');
    expect(html).toContain('Takes everything out, and Hair with it');
  });

  it('offers the delete outright when nothing is filed under it', () => {
    const html = card('en', []);
    expect(html).toContain('Nothing is filed under this category yet');
    expect(html).toContain('Delete category');
    expect(html).not.toContain('Select all');
  });

  it('shows a retired service, dimmed and badged, so Select all still means the whole category', () => {
    const html = card('en', [svc({}), svc({ id: 's2', name: 'Keratin', active: false })]);
    expect(html).toContain('Retired');
    expect(html).toContain('is-retired');
  });

  it('reads in Hindi', () => {
    const html = card('hi', [svc({})]);
    expect(html).toContain('सभी चुनें');
    expect(html).toContain('चुनें कि मेन्यू से क्या हटाना है');
    for (const s of ['Select all', 'Pick what to take off the menu']) expect(html, s).not.toContain(s);
  });
});
