import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { CategoryPicker, type CategoryOption } from './CategoryPicker';
import { ALL_TAB, RETIRED_TAB, type ServiceTab } from './services-tabs';

/**
 * Jira GRW-587 — the control that replaced the row of tabs.
 *
 * What is worth pinning is the part the tabs got wrong at scale: the thing on screen when the menu is closed is
 * ONE row, whatever the branch has, and the name it shows is the part of the menu being looked at. A salon that
 * typed in its printed price list has 23 categories; the strip rendered all of them and ran 2241px off the side
 * of a 343px screen.
 *
 * The closed state is what these assert, because that is the state the screen is in. The open list is the same
 * rows plus All and Retired, which `servicesOnTab`/`tabCounts` already own and `services-tabs.test.ts` covers.
 */
const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: child }),
  );

const CATS: CategoryOption[] = [
  { id: 'c-wax', name: 'Waxing' },
  { id: 'c-facial', name: 'Facial' },
];

const counts = (over: Partial<{ all: number; retired: number; byCategory: Map<string, number> }> = {}) => ({
  all: 189,
  retired: 0,
  byCategory: new Map([
    ['c-wax', 36],
    ['c-facial', 23],
  ]),
  ...over,
});

const picker = (tab: ServiceTab, over: { showRetired?: boolean; categories?: CategoryOption[] } = {}, locale: 'en' | 'hi' = 'en') =>
  wrap(
    locale,
    createElement(CategoryPicker, {
      tab,
      categories: over.categories ?? CATS,
      counts: counts(),
      showRetired: over.showRetired ?? false,
      onPick: () => {},
    }),
  );

describe('the Services category picker', () => {
  it('names the whole menu and its size when nothing is filtered', () => {
    const html = picker(ALL_TAB);
    expect(html).toContain('>All<');
    expect(html).toContain('>189<');
  });

  it('names the chosen category and ITS count, not the whole menu', () => {
    const html = picker('c-wax');
    expect(html).toContain('>Waxing<');
    expect(html).toContain('>36<');
    // The bug this guards: showing the branch total next to a category's name.
    expect(html).not.toContain('>189<');
  });

  /**
   * The whole point of the change: one row closed, however many categories there are. 23 of them is a real
   * price list, not a stress test — see the header comment.
   */
  it('renders ONE row closed, whatever the branch has', () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ id: `c${i}`, name: `Category ${i}` }));
    const html = picker(ALL_TAB, { categories: many });
    expect(html.match(/<button/g)).toHaveLength(1);
    // None of the 23 is drawn until the owner opens the list.
    expect(html).not.toContain('Category 7');
  });

  it('is a disclosure that starts closed, and says so', () => {
    const html = picker(ALL_TAB);
    expect(html).toContain('aria-expanded="false"');
    // A menu promises arrow keys and type-ahead; this is buttons Tab walks through (the branch picker's rule).
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain('role="tablist"');
  });

  it('falls back to the whole menu when the chosen category is gone', () => {
    // A category deleted from the sheet while its tab was selected: name the menu rather than render blank.
    const html = picker('c-deleted');
    expect(html).toContain('>All<');
  });

  it('names the Retired drawer when that is what is being looked at', () => {
    const html = picker(RETIRED_TAB, { showRetired: true });
    expect(html).toContain('>Retired<');
  });

  it('is translated, not left in English', () => {
    const html = picker(ALL_TAB, {}, 'hi');
    expect(html).toContain(hi.services.categoryPicker.label);
    expect(html).not.toContain(en.services.categoryPicker.label);
  });
});
