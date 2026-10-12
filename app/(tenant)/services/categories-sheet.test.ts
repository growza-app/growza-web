import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ServiceAdmin, ServiceCategoryAdmin } from '../lib/api';
import { CategoriesSheet } from './CategoriesSheet';
import { CategoryRow } from './CategoryRow';
import { CategoryServices } from './CategoryServices';
import { CategoryDeleteCard } from './CategoryDeleteCard';

/**
 * Jira GRW-428 — the category sheet, rendered from the real component in both languages.
 *
 * What is worth pinning here is not that it renders: it is the counting, which is the one place this screen can
 * mislead. `serviceCount` includes retired services because it is what a delete takes with it; `activeCount` is
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

const sheet = (
  locale: 'en' | 'hi',
  rows: ServiceCategoryAdmin[],
  services: ServiceAdmin[] = [],
  startIn: 'read' | 'edit' | 'pick' = 'read',
) =>
  wrap(
    locale,
    createElement(CategoriesSheet, { branchId: 'b1', initial: rows, services, onClose: () => {}, onChanged: () => {}, startIn }),
  );

/**
 * Jira GRW-591 — one row in either state. The sheet renders the reading state and only a tap on Edit moves
 * it, which a static render cannot do, so the row is driven directly: it is the component that holds the
 * difference between the two states anyway.
 */
const row = (
  locale: 'en' | 'hi',
  over: Partial<ServiceCategoryAdmin>,
  state: Partial<{ mode: 'read' | 'edit' | 'pick'; orderable: boolean; atTop: boolean; atBottom: boolean; selected: boolean }> = {},
) =>
  wrap(
    locale,
    createElement(CategoryRow, {
      row: cat(over),
      mode: state.mode ?? 'read',
      orderable: state.orderable ?? true,
      busy: false,
      atTop: state.atTop ?? false,
      atBottom: state.atBottom ?? false,
      dragging: false,
      selected: state.selected ?? false,
      onToggle: () => {},
      onOpen: () => {},
      onRename: () => {},
      onMove: () => {},
      onDragStart: () => {},
      onDragEnd: () => {},
      onDragOver: () => {},
      onDrop: () => {},
    }),
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
  it('counts every service a delete would take with it, retired ones included', () => {
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
  });

  /**
   * Jira GRW-591 — the list is for reading. A row carries its name, its count and a chevron, and nothing
   * else: no grip, no arrows, no rename. That is what took the row from 172px to 53px, so this is the
   * assertion that keeps it there — a control put back on the row is a control that has to earn it.
   */
  it('reads as a plain list: no reorder or rename controls until Edit is tapped', () => {
    const html = sheet('en', [cat({ id: 'a', name: 'Hair' }), cat({ id: 'b', name: 'Nails' })]);
    expect(html).toContain('Hair');
    expect(html).toContain('10 services');
    expect(html).toContain('svc-cat-chevron');
    for (const gone of ['Move Hair up', 'Move Nails down', 'Rename Hair', 'svc-cat-grip', 'svc-cat-actions']) {
      expect(html, gone).not.toContain(gone);
    }
    // And the way in is on the title line, holding the state it will put the sheet into.
    expect(html).toContain('Edit');
    expect(html).toContain('aria-pressed="false"');
  });

  /** One category is still worth renaming, even though there is no order to set. */
  it('offers Edit for a single category, and the order hint only when there is an order', () => {
    expect(sheet('en', [cat({ name: 'Hair' })])).toContain('Edit');
    expect(sheet('en', [])).not.toContain('aria-pressed');
  });

  /**
   * Nothing destructive lives on the list row any more (owner's change, 2026-10-02): the row opens the
   * category, and removing services — or the category with them — happens in there against a selection.
   * Edit mode did not change that — it adds the two arrows and the rename, and no delete.
   */
  it('offers no delete on the row itself, in either mode', () => {
    for (const html of [row('en', { name: 'Hair' }), row('en', { name: 'Hair' }, { mode: 'edit' })]) {
      expect(html).not.toContain('Delete');
    }
  });

  /** Closing the sheet is not finishing an edit: two buttons saying "Done" would be two different things. */
  it('closes with Close, leaving Done to mean leaving edit mode', () => {
    expect(sheet('en', [cat({})])).toContain('Close');
  });

  it('reads in Hindi', () => {
    const html = sheet('hi', [cat({ name: 'Hair', serviceCount: 10, activeCount: 10 }), cat({ id: 'z', name: 'Nails', serviceCount: 0, activeCount: 0 })]);
    expect(html).toContain('बदलें');
    expect(html).toContain('श्रेणियाँ');
    expect(html).toContain('10 सेवाएँ');
    expect(html).toContain('अभी कोई सेवा नहीं');
    for (const s of ['New category name', 'No services yet', '10 services']) expect(html, s).not.toContain(s);
  });
});

/** Jira GRW-591 — what a sheet with a real salon's worth of categories shows, and what it no longer does. */
describe('a long list of categories', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => cat({ id: `c${i}`, name: `Category ${i}` }));

  it('offers a search field once there are a dozen, and not before', () => {
    expect(sheet('en', many(11))).not.toContain('Find a category');
    expect(sheet('en', many(12))).toContain('Find a category');
  });

  /** By a dozen the owner knows what a category is, and the line is in the way of the field that finds one. */
  it('drops the subtitle when the search field arrives', () => {
    expect(sheet('en', many(11))).toContain('The groups your services are listed under');
    expect(sheet('en', many(12))).not.toContain('The groups your services are listed under');
  });

  it('adds from a row at the foot of the list, not a field standing open under it', () => {
    const html = sheet('en', many(3));
    expect(html).toContain('svc-cat-addrow');
    expect(html).toContain('New category');
    // The field, its Add button and the footnote about empty categories are all behind that row now.
    expect(html).not.toContain('New category name');
    expect(html).not.toContain('stays hidden from clients');
  });
});

/** Jira GRW-591 — the services filed under nothing: one row, and a list only when it is asked for. */
describe('the services in no category', () => {
  const loose = [svc({ id: 'l1', name: 'Head massage', categoryId: null }), svc({ id: 'l2', name: 'Threading', categoryId: null })];

  it('is one row that says how many and that clients cannot see them', () => {
    const html = sheet('en', [cat({})], loose);
    expect(html).toContain('Not in a category');
    expect(html).toContain('2 services · hidden from clients');
    expect(html).toContain('aria-expanded="false"');
    // Closed: it does not print every loose service under the list it is already longer than.
    expect(html).not.toContain('Head massage');
    expect(html).not.toContain('File these under a category');
  });

  it('is not there at all when every service has a category', () => {
    expect(sheet('en', [cat({})], [svc({})])).not.toContain('Not in a category');
  });
});

/** Jira GRW-591 — the two states of a row, which is where the whole redesign lives. */
describe('a category row', () => {
  it('reading the list, carries its count and a chevron and nothing to press by accident', () => {
    const html = row('en', { name: 'Hair', serviceCount: 10, activeCount: 10 });
    expect(html).toContain('10 services');
    expect(html).toContain('svc-cat-chevron');
    for (const gone of ['svc-cat-grip', 'svc-cat-actions', 'svc-cat-pencil', 'Move Hair up', 'Rename Hair']) {
      expect(html, gone).not.toContain(gone);
    }
  });

  it('editing, trades the count and chevron for the grip, the arrows and a rename on the name itself', () => {
    const html = row('en', { name: 'Hair', serviceCount: 10, activeCount: 10 }, { mode: 'edit' });
    expect(html).toContain('Rename Hair');
    expect(html).toContain('Move Hair up');
    expect(html).toContain('Move Hair down');
    expect(html).toContain('svc-cat-grip');
    expect(html).toContain('svc-cat-pencil');
    // The count and the chevron are gone: nothing on this row navigates while it is being edited.
    expect(html).not.toContain('10 services');
    expect(html).not.toContain('svc-cat-chevron');
  });

  /** One category has a name to fix and no position to move it to. */
  it('editing a list of one, offers the rename and no arrows', () => {
    const html = row('en', { name: 'Hair' }, { mode: 'edit', orderable: false });
    expect(html).toContain('Rename Hair');
    expect(html).not.toContain('Move Hair up');
    expect(html).not.toContain('svc-cat-grip');
  });

  it('disables the arrow that would move a row off the end', () => {
    // The opening tag of the one button carrying this label — not a window of characters before it, which
    // reaches back into the previous button and reads ITS disabled attribute as this one's.
    const tag = (html: string, label: string) => {
      const at = html.indexOf(`aria-label="${label}"`);
      expect(at, label).toBeGreaterThan(-1);
      return html.slice(html.lastIndexOf('<button', at), at);
    };
    const top = row('en', { name: 'Hair' }, { mode: 'edit', atTop: true });
    expect(tag(top, 'Move Hair up')).toContain('disabled');
    expect(tag(top, 'Move Hair down')).not.toContain('disabled');

    const bottom = row('en', { name: 'Hair' }, { mode: 'edit', atBottom: true });
    expect(tag(bottom, 'Move Hair up')).not.toContain('disabled');
    expect(tag(bottom, 'Move Hair down')).toContain('disabled');
  });

  it('reads in Hindi', () => {
    const html = row('hi', { name: 'Hair' }, { mode: 'edit' });
    expect(html).toContain('Hair का नाम बदलें');
    expect(html).not.toContain('Rename Hair');
  });
});

/**
 * Jira GRW-592 — deleting categories in bulk.
 *
 * The one thing this screen must not get wrong: deleting a category does NOT delete the services in it.
 * The server releases them — they stay on the owner's list with no category, which hides them from clients
 * until they are filed again. A confirmation that said "deleted for good" would cost an owner a menu they
 * still have, so the wording is pinned here, not just the buttons.
 */
describe('picking categories to delete', () => {
  it('shows no tick and no Select all until Delete is tapped', () => {
    const html = sheet('en', [cat({ name: 'Hair' }), cat({ id: 'b', name: 'Nails' })]);
    expect(html).not.toContain('svc-cat-tick');
    expect(html).not.toContain('Select all');
    expect(html).not.toContain('Pick what to delete');
    expect(html).toContain('Close');
  });

  /**
   * The failure this exists to stop: the delete used to appear only once a row was ticked, so an owner who
   * tapped Edit saw six ticks and a Close button and reported that deleting a category was not built. The
   * action is present and disabled from the moment Edit is on, exactly as the delete card next door does
   * it, and its label says what it is waiting for.
   */
  it('offers Delete on the title line, beside Edit, not behind it', () => {
    const html = sheet('en', [cat({ name: 'Hair' })]);
    const title = html.slice(html.indexOf('svc-cat-title'), html.indexOf('modal-body'));
    expect(title).toContain('>Delete<');
    expect(title).toContain('>Edit<');
    // Still nothing to tick until that button is pressed — the list is for reading.
    expect(html).not.toContain('svc-cat-tick');
    expect(html).not.toContain('Select all');
  });

  it('offers no Delete and no Edit when there is nothing to act on', () => {
    const html = sheet('en', []);
    expect(html).not.toContain('>Delete<');
    expect(html).not.toContain('>Edit<');
  });

  /**
   * Jira GRW-592 — Select all acts on the whole list, so it cannot be the first ROW of the list: with
   * twenty-six categories it scrolled off the top the moment the owner went looking for the fourth one
   * to tick. It lives on the title line, which `.modal-fit` never scrolls.
   */
  it('keeps Select all out of the scrolling list', () => {
    // Rendered IN pick mode: in read mode the control does not exist, so asserting on it there proves nothing.
    const html = sheet('en', [cat({}), cat({ id: 'b', name: 'Nails' })], [], 'pick');
    const body = html.indexOf('modal-body');
    expect(html.slice(0, body)).toContain('Select all');
    expect(html.slice(body)).not.toContain('Select all');
    expect(html).not.toContain('svc-cat-pickall');
  });

  it('withholds the add row only while rows are being picked', () => {
    expect(sheet('en', [cat({})], [], 'pick')).not.toContain('New category');
    expect(sheet('en', [cat({})], [], 'read')).toContain('New category');
  });

  /**
   * Deleting the last category used to leave "Add one below" over nothing: the add row lived inside the list,
   * which is not rendered when the list is empty.
   */
  it('still offers a way to add when there are no categories', () => {
    const html = sheet('en', []);
    expect(html).toContain('You have no categories yet');
    expect(html).toContain('New category');
  });

  it('keeps the disabled-action wording the delete card already uses', () => {
    const copy = en.services.categories;
    expect(copy.pickToDelete).toBe('Pick what to delete');
    expect(copy.pickSome).toBe('Pick what to take off the menu');
  });

  it('gives a picked row a tick and nothing else — no arrows, no chevron, no rename', () => {
    const html = row('en', { name: 'Hair', serviceCount: 10, activeCount: 10 }, { mode: 'pick' });
    expect(html).toContain('Select Hair');
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="false"');
    // The count stays: it is the consequence being decided, not decoration.
    expect(html).toContain('10 services');
    for (const gone of ['Move Hair up', 'Rename Hair', 'svc-cat-chevron', 'svc-cat-grip']) {
      expect(html, gone).not.toContain(gone);
    }
  });

  /**
   * The two modes stay apart. A row that carried the tick AND the arrows AND the rename came to five
   * controls in a 252px phone row and left 72px for the name, which is four characters.
   */
  it('keeps ticks out of edit mode, and arrows out of pick mode', () => {
    expect(row('en', { name: 'Hair' }, { mode: 'edit' })).not.toContain('Select Hair');
    expect(row('en', { name: 'Hair' }, { mode: 'edit' })).toContain('Move Hair up');
    expect(row('en', { name: 'Hair' }, { mode: 'pick' })).not.toContain('Move Hair up');
  });

  it('marks a ticked row by more than colour', () => {
    const html = row('en', { name: 'Hair' }, { mode: 'pick', selected: true });
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('is-picked');
  });

  /**
   * "in it" / "in them" follows the number of CATEGORIES, "is" / "are" and "The 1 service" the number of
   * SERVICES — two different counts in one sentence.
   */
  it('agrees "it / them" with the categories and "is / are" with the services', () => {
    const t = createTranslator({ locale: 'en', messages: en, namespace: 'services.categories' });
    expect(t('deleteCatsGoes', { count: 7, categories: 1 })).toMatch(/^The 7 services in it are deleted too/);
    expect(t('deleteCatsGoes', { count: 1, categories: 3 })).toMatch(/^The 1 service in them is deleted too/);
  });

  /**
   * Jira GRW-592 — deleting a category deletes what is in it. The first build kept the services ("they stay
   * on your list") and the first owner to use it said that was not what delete means. The wording must not
   * promise the old behaviour, and must say it cannot be undone.
   */
  it('says the services go with their category, and that it is final', () => {
    const copy = en.services.categories;
    expect(copy.deleteCatsGoes).toContain('deleted too');
    expect(copy.deleteCatsGoes).toContain('cannot be undone');
    expect(copy.pickHint).toContain('deleted too');
    for (const old of ['stay on your list', 'stays on your list', 'with no category']) {
      expect(copy.deleteCatsGoes, old).not.toContain(old);
      expect(copy.pickHint, old).not.toContain(old);
    }
    const t = createTranslator({ locale: 'en', messages: en, namespace: 'services.categories' });
    expect(t('deleteCatsWithServices', { categories: 3, count: 14 })).toBe('Delete 3 categories and 14 services');
    expect(t('deleteCatsWithServices', { categories: 1, count: 1 })).toBe('Delete 1 category and 1 service');
  });

  it('removes the services before the categories, so a held service keeps its category', () => {
    const src = readFileSync(join(__dirname, 'CategoriesSheet.tsx'), 'utf8');
    const del = src.slice(src.indexOf('const deletePicked'));
    expect(del.indexOf('api.deleteServices')).toBeGreaterThan(-1);
    expect(del.indexOf('api.deleteServices')).toBeLessThan(del.indexOf('api.deleteCategory'));
    expect(del).toContain('keep.has(c.id)');
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
        onChanged: () => {},
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

/**
 * Found by driving the sheet at 320px, 812x375 and 390px — none of which a static render can see. Each of these
 * was a real defect on a real viewport, so the rule that fixes it is pinned where the next edit would undo it.
 */
describe('the sheet at the sizes it broke on', () => {
  const css = (file: string) => readFileSync(join(__dirname, '..', 'styles', file), 'utf8');
  const sheet10 = css('10-tables-services-staff-pages.css');
  const sheet97 = css('97-services-rebuilt.css');

  it('lets the "not in a category" sentence wrap instead of crushing the name to "N…" at 320px', () => {
    expect(sheet97).toMatch(/\.svc-cat-text\.svc-cat-unsorted-head > \.svc-cat-meta \{[^}]*white-space: normal/);
    expect(sheet97).toMatch(/\.svc-cat-text\.svc-cat-unsorted-head > \.svc-cat-name \{[^}]*flex: 0 0 auto/);
  });

  it('gives the rows the height on a phone held sideways (the list was 6px tall in Delete mode)', () => {
    const short = sheet10.slice(sheet10.indexOf('@media (max-height: 560px) {\n  .modal-actions.svc-cat-sheet-actions'));
    expect(short).toContain('flex-direction: row');
    expect(short).toContain('.svc-cat-title + .svc-cat-hint');
  });

  it('draws one field for the search, not a second inset one inside it', () => {
    const block = sheet10.slice(sheet10.indexOf(".svc-cat-filter input[type='search'] {"));
    expect(block.slice(0, block.indexOf('}'))).toContain('box-shadow: none');
  });
});

/**
 * Jira GRW-590 — getting rid of a whole category.
 *
 * It took five taps and the one control that did it was invisible: Categories, the row, Delete, then a tick
 * called "Select all" sitting in a list of services looking exactly like them, then confirm. Owners reported
 * they had no way to delete a category at all and were removing services one at a time — the honest reading
 * of a path that long.
 *
 * The list row is still not where this happens (the owner's call, 2026-10-02, and the test above still holds
 * it). What changed is that the category's own screen now names both things it can do, and asking for the
 * whole category opens the card with the whole category already ticked.
 */
describe('the two ways out of a category', () => {
  const detailOf = (locale: 'en' | 'hi', services: ServiceAdmin[]) =>
    wrap(
      locale,
      createElement(CategoryServices, {
        branchId: 'b1',
        category: cat({ id: 'a', name: 'Hair', serviceCount: services.length, activeCount: services.length }),
        services,
        onBack: () => {},
        onChanged: () => {},
      }),
    );

  const cardOf = (locale: 'en' | 'hi', services: ServiceAdmin[], preselect?: 'all' | 'none') =>
    wrap(
      locale,
      createElement(CategoryDeleteCard, {
        branchId: 'b1',
        category: cat({ id: 'a', name: 'Hair', serviceCount: services.length, activeCount: services.length }),
        services,
        ...(preselect ? { preselect } : {}),
        onClose: () => {},
        onDone: () => {},
        onChanged: () => {},
      }),
    );

  const three = [svc({}), svc({ id: 's2', name: 'Keratin' }), svc({ id: 's3', name: 'Hair spa' })];

  it('names the whole-category action, and says how much it takes', () => {
    const html = detailOf('en', three);
    expect(html).toContain('Delete this category and all 3 services');
  });

  it('offers picking a few as the quieter second action', () => {
    expect(detailOf('en', three)).toContain('Remove some services');
  });

  it('does not offer "remove some" when there is nothing to remove', () => {
    const html = detailOf('en', []);
    expect(html).not.toContain('Remove some services');
    // And the wording drops the count rather than reading "and all 0 services".
    expect(html).not.toContain('and all 0');
  });

  it('opens the card with the whole category already ticked', () => {
    const html = cardOf('en', three, 'all');
    // Three services and the "Select all" row itself.
    expect(html.match(/aria-checked="true"/g)).toHaveLength(4);
    expect(html).not.toContain('aria-checked="false"');
  });

  it('that card already says what it will do, instead of asking', () => {
    const html = cardOf('en', three, 'all');
    expect(html).not.toContain('Pick what to take off the menu');
    expect(html).toContain('Delete Hair and all 3');
  });

  it('leaves the card untouched on the path in from "remove some"', () => {
    const html = cardOf('en', three, 'none');
    expect(html).not.toContain('aria-checked="true"');
    expect(html).toContain('Pick what to take off the menu');
  });

  it('defaults to ticking nothing, so a caller that says nothing is the old behaviour', () => {
    expect(cardOf('en', three)).not.toContain('aria-checked="true"');
  });

  it('is translated, not left in English', () => {
    const html = detailOf('hi', three);
    expect(html).not.toContain('Remove some services');
    expect(html).not.toContain('Delete this category and all');
  });
});
