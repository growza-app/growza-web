import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_USER_COLUMNS,
  BUSINESS_COLUMNS,
  INVOICE_COLUMNS,
  PAYMENT_COLUMNS,
  SUBSCRIPTION_COLUMNS,
  USAGE_COLUMNS,
} from './list-columns';
import {
  TABLE_COLUMN_GAP_PX,
  TABLE_PADDING_X_PX,
  chooseTableLayout,
  gridTemplate,
  tableMinWidth,
  type TableColumn,
  type TableLayout,
} from './table-layout';
import { ADMIN_ROUTES, ADMIN_TABLE_FOLDS, ADMIN_VIEWPORT_SIZES } from '../../../../e2e/matrix';

/**
 * Jira GRW-288 — every column of every admin list table is visible, without a
 * sideways scroll, at 1024x768, at 1440x900 and at every width between.
 *
 * QA measured the defect: at 1024 the Businesses table was drawn 718px wide
 * with a 1180px minimum, so it scrolled inside its own box and Status and
 * Created were behind that scroll; at 1440 it was still 46px short. Five more
 * tables did the same at their own widths.
 *
 * There is no browser in `npm test`; `npm run test:devices` is the real
 * measurement. What this pins is the decision that makes the defect
 * impossible — a table is only ever a table in a box at least as wide as its
 * own minimum, and cards otherwise — plus the laptop outcomes the fix was
 * chosen for, so a later column cannot quietly turn the laptop table into
 * cards without this failing.
 */

const admin = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

/**
 * The width of the box a list table is drawn in, from AdminShell and admin.css:
 * the 256px sidebar, the content's 24px padding each side, a 15px classic
 * scrollbar (the worst case — overlay scrollbars take nothing), and 20px each
 * side more for the three tables that sit inside a `Card`.
 */
const SIDEBAR = 256;
const CONTENT_PADDING = 48;
const SCROLLBAR = 15;
const CARD_PADDING = 40;
const boxAt = (viewport: number, inCard: boolean) => viewport - SIDEBAR - CONTENT_PADDING - SCROLLBAR - (inCard ? CARD_PADDING : 0);

const TABLES: { name: string; route: string; columns: TableColumn[]; inCard: boolean }[] = [
  { name: 'Businesses', route: '/admin/businesses', columns: BUSINESS_COLUMNS, inCard: false },
  { name: 'Subscriptions', route: '/admin/subscriptions', columns: SUBSCRIPTION_COLUMNS, inCard: false },
  { name: 'Invoices', route: '/admin/invoices', columns: INVOICE_COLUMNS, inCard: false },
  { name: 'Payments', route: '/admin/payments', columns: PAYMENT_COLUMNS, inCard: false },
  { name: 'Usage', route: '/admin/usage', columns: USAGE_COLUMNS, inCard: true },
  { name: 'Platform users', route: '/admin/users', columns: ADMIN_USER_COLUMNS, inCard: true },
];

const layoutAt = (viewport: number, t: (typeof TABLES)[number]): TableLayout =>
  chooseTableLayout({ boxWidth: boxAt(viewport, t.inCard), phone: viewport <= 860, columns: t.columns });

describe('the layout decision', () => {
  const cols: TableColumn[] = [
    { label: 'A', width: '2fr', min: 100 },
    { label: 'B', width: '3fr', min: 60, optional: true },
    { label: '', width: '36px' },
  ];
  // 100 + 60 + 36, two gaps, the row padding.
  const full = 196 + 2 * TABLE_COLUMN_GAP_PX + TABLE_PADDING_X_PX;
  const compact = 136 + TABLE_COLUMN_GAP_PX + TABLE_PADDING_X_PX;

  it('derives the minimum from the columns, gaps and padding', () => {
    expect(tableMinWidth(cols)).toBe(full);
    expect(tableMinWidth(cols, { compact: true })).toBe(compact);
  });

  it('a table exactly at its minimum is a table (boundary; +2 is the border)', () => {
    expect(chooseTableLayout({ boxWidth: full + 2, phone: false, columns: cols })).toBe('table');
  });

  it('one pixel short drops the optional columns, not every column', () => {
    expect(chooseTableLayout({ boxWidth: full + 1, phone: false, columns: cols })).toBe('compact');
    expect(chooseTableLayout({ boxWidth: compact + 2, phone: false, columns: cols })).toBe('compact');
  });

  it('narrower than even that is cards — never a table that scrolls', () => {
    expect(chooseTableLayout({ boxWidth: compact + 1, phone: false, columns: cols })).toBe('cards');
  });

  it('a phone is always cards, however wide the box (GRW-267 · GRW-272)', () => {
    expect(chooseTableLayout({ boxWidth: 5000, phone: true, columns: cols })).toBe('cards');
  });

  it('a table with no column minimums keeps the number it was given', () => {
    const plain: TableColumn[] = [
      { label: 'Phone', width: '2fr' },
      { label: 'Role', width: '1fr' },
    ];
    expect(chooseTableLayout({ boxWidth: 422, phone: false, columns: plain, fallbackMinWidth: 420 })).toBe('table');
    expect(chooseTableLayout({ boxWidth: 421, phone: false, columns: plain, fallbackMinWidth: 420 })).toBe('cards');
  });

  it('every column minimum becomes a real grid minimum, and compact leaves out the optional track', () => {
    expect(gridTemplate(cols)).toBe('minmax(100px, 2fr) minmax(60px, 3fr) 36px');
    expect(gridTemplate(cols, true)).toBe('minmax(100px, 2fr) 36px');
  });
});

describe('the six list tables on a laptop', () => {
  it('AC — 1440x900: every list table is a full table, every column shown', () => {
    for (const t of TABLES) expect(layoutAt(1440, t), t.name).toBe('table');
  });

  it('1366x768, the commonest laptop: still every column as a table', () => {
    for (const t of TABLES) expect(layoutAt(1366, t), t.name).toBe('table');
  });

  it('1280: Businesses gives up its two placeholder columns before it gives up being a table', () => {
    expect(layoutAt(1280, TABLES[0]!)).toBe('compact');
    expect(BUSINESS_COLUMNS.filter((c) => c.optional).map((c) => c.label)).toEqual(['Bookings', 'Usage']);
  });

  it('AC — 1024x768: the five tables QA found scrolling become cards; Usage fits and stays a table', () => {
    expect(Object.fromEntries(TABLES.map((t) => [t.name, layoutAt(1024, t)]))).toEqual({
      Businesses: 'cards',
      Subscriptions: 'cards',
      Invoices: 'cards',
      Payments: 'cards',
      Usage: 'table',
      'Platform users': 'cards',
    });
  });

  it('boundary: no width from 861 to 1600 draws any of them as a table in a box narrower than its minimum', () => {
    for (let viewport = 861; viewport <= 1600; viewport += 1) {
      for (const t of TABLES) {
        const layout = layoutAt(viewport, t);
        const inner = boxAt(viewport, t.inCard) - 2;
        if (layout === 'table') expect(inner, `${t.name} @${viewport}`).toBeGreaterThanOrEqual(tableMinWidth(t.columns));
        if (layout === 'compact') expect(inner, `${t.name} @${viewport}`).toBeGreaterThanOrEqual(tableMinWidth(t.columns, { compact: true }));
      }
    }
  });
});

describe('the device matrix measures what this arithmetic decides (AC-06)', () => {
  // The viewport, with no classic scrollbar, at which a table first fits.
  const foldAt = (t: (typeof TABLES)[number], compact: boolean) =>
    tableMinWidth(t.columns, { compact }) + 2 + SIDEBAR + CONTENT_PADDING + (t.inCard ? CARD_PADDING : 0);

  it('ADMIN_TABLE_FOLDS lists every list table’s edge, at the width its columns add up to', () => {
    const expected = TABLES.flatMap((t) => [
      { route: t.route, layout: 'table', width: foldAt(t, false) },
      ...(t.columns.some((c) => c.optional) ? [{ route: t.route, layout: 'compact', width: foldAt(t, true) }] : []),
    ]);
    const sort = (rows: { route: string; layout: string; width: number }[]) =>
      [...rows].sort((a, b) => `${a.route}${a.layout}`.localeCompare(`${b.route}${b.layout}`));
    expect(sort([...ADMIN_TABLE_FOLDS])).toEqual(sort(expected));
    for (const fold of ADMIN_TABLE_FOLDS) expect(ADMIN_ROUTES as readonly string[]).toContain(fold.route);
  });

  it('the admin sweep includes 361, 860 and 1000, and 1024 is the 768-tall landscape iPad', () => {
    const sizes = ADMIN_VIEWPORT_SIZES.map(([w, h]) => `${w}x${h}`);
    for (const w of [359, 360, 361, 859, 860, 861, 999, 1000, 1001]) expect(sizes.some((s) => s.startsWith(`${w}x`)), String(w)).toBe(true);
    expect(sizes).toContain('1024x768');
    expect(sizes).not.toContain('1024x1366');
    expect(sizes).toContain('1440x900');
  });
});

describe('the stylesheet and the component agree with the arithmetic', () => {
  const css = admin('admin.css');
  const primitives = admin('components/primitives.tsx');

  it('the grid gap and row padding are the numbers the minimum is computed from', () => {
    expect(css).toMatch(new RegExp(`\\.admin-table-row \\{[^}]*grid-template-columns: var\\(--admin-cols\\);[^}]*column-gap: ${TABLE_COLUMN_GAP_PX}px;`));
    expect(css).toMatch(new RegExp(`\\.admin-table-row \\{\\s*padding: 14px ${TABLE_PADDING_X_PX / 2}px;`));
  });

  it('the card layout is keyed on the measured layout, not on the 860px query alone', () => {
    expect(css).toMatch(/\.admin-table\[data-layout='cards'\] \.admin-table-inner \{\s*min-width: 0;/);
    expect(css).toMatch(/\.admin-table\[data-layout='cards'\] \.admin-table-head \{\s*display: none;/);
    expect(css).toMatch(/\.admin-table\[data-layout='compact'\] \[data-optional='true'\] \{\s*display: none;/);
    // The phone query no longer carries a second copy that could drift.
    const phone = css.slice(css.indexOf('GRW-267 · GRW-272 — the admin portal on a phone'));
    expect(phone).not.toMatch(/\n {2}\.admin-table-inner \{/);
  });

  it('Table measures its own box and hands the result to the stylesheet', () => {
    expect(primitives).toMatch(/new ResizeObserver\(update\)/);
    expect(primitives).toMatch(/chooseTableLayout\(\{ boxWidth: el\.offsetWidth/);
    expect(primitives).toMatch(/data-layout=\{layout\}/);
  });

  it('no list screen hand-types a minimum width again', () => {
    for (const page of ['businesses', 'subscriptions', 'invoices', 'payments', 'usage', 'users']) {
      expect(admin(`${page}/page.tsx`), page).not.toMatch(/minWidthPx=/);
    }
  });
});
