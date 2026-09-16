/**
 * Jira GRW-288 — when an admin table is a table, and when it is cards.
 *
 * ## The defect
 *
 * GRW-277 made every admin table a grid with a `min-width` inside its own
 * horizontal scroller, and folded it into cards at the shell's 860px
 * breakpoint. Between 861px and ~1400px neither half of that worked: the
 * sidebar is back, so a 1024x768 iPad in landscape has 718px of table, and the
 * Businesses grid wanted 1180. It showed six of ten columns — Status cut in
 * half, Created behind a sideways scroll inside the card that nobody finds —
 * and at 1440x900 it was still 46px short. Subscriptions, Invoices, Payments,
 * Usage and Platform users had the same problem at their own widths.
 *
 * ## Why the fold point is the TABLE's width, not the viewport's
 *
 * Each table stops fitting at a different width — Usage (5 short columns,
 * inside a card) fits at 1024, Businesses (10 columns) does not fit until
 * ~1330 — so one breakpoint for all of them either cards a table that fits or
 * scrolls one that does not. A breakpoint per table is a media query per table,
 * each duplicating the whole card stylesheet, and a number that goes stale the
 * moment a column is added. So the question is asked directly: is the box this
 * table is drawn in at least as wide as the table's own minimum? That is a
 * measurement (`Table` in primitives.tsx observes it), and this file is the pure
 * half of it so the decision can be tested without a browser.
 *
 * The minimum is derived from the columns (`min` per column, plus the grid's
 * gaps and the row's padding), not typed in beside them — the hand-kept
 * `minWidthPx={1180}` numbers are how the tables drifted from their content.
 *
 * ## Three layouts
 *
 * - `table` — every column, when the box holds the full minimum.
 * - `compact` — a table without the columns marked `optional`, when it holds
 *   that smaller minimum. Only Businesses uses it: its Bookings and Usage
 *   columns are placeholders for figures not metered yet (GRW-85), and a
 *   1280px laptop showing the real eight columns as a table beats showing all
 *   ten as cards.
 * - `cards` — anything narrower, and always on a phone (≤860px): the GRW-267 ·
 *   GRW-272 card, first column across the top and the rest as labelled pairs.
 *
 * By construction a table is never drawn in a box narrower than its minimum,
 * so there is nothing left for the inner scroller to scroll.
 */

/** The shell's phone breakpoint (admin.css). At or below it a table is always cards. */
export const ADMIN_PHONE_QUERY = '(max-width: 860px)';

/** `column-gap` of `.admin-table-head` / `.admin-table-row` in admin.css. */
export const TABLE_COLUMN_GAP_PX = 12;

/** `.admin-table-row`'s left + right padding (20px each) in admin.css. */
export const TABLE_PADDING_X_PX = 40;

/** `.admin-table`'s 1px border, both sides — inside its measured box, outside the grid. */
export const TABLE_BORDER_X_PX = 2;

export interface TableColumnSizing {
  /** CSS grid track, e.g. '1.5fr' or '120px'. */
  width: string;
  /**
   * The narrowest this column can be and still show its content — a status
   * pill does not wrap, a date should not break mid-way. When set, the track
   * becomes `minmax(<min>px, <width>)` and the number counts towards the
   * table's minimum. A fixed `px` width counts as its own minimum.
   */
  min?: number;
  /** Dropped in the `compact` layout. See the file comment for the one user. */
  optional?: boolean;
}

export interface TableColumn extends TableColumnSizing {
  label: string;
  right?: boolean;
  /**
   * Jira GRW-267 · GRW-272 — `false` leaves this column off the card layout
   * (a phone, or since GRW-288 a laptop too narrow for the table). For what a
   * card does not need: a placeholder for a figure not built yet, or an "open"
   * chevron on a row that already opens when tapped.
   */
  mobile?: boolean;
}

export type TableLayout = 'table' | 'compact' | 'cards';

function fixedPx(width: string): number {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(width.trim());
  return match ? Number(match[1]) : 0;
}

export function columnMin(column: TableColumnSizing): number {
  return column.min ?? fixedPx(column.width);
}

export function trackOf(column: TableColumnSizing): string {
  return column.min !== undefined ? `minmax(${column.min}px, ${column.width})` : column.width;
}

export function gridTemplate(columns: TableColumnSizing[], compact = false): string {
  return columns
    .filter((c) => !(compact && c.optional))
    .map(trackOf)
    .join(' ');
}

/**
 * The narrowest box (inside the table's border) that holds every column at its
 * minimum — or, with `compact`, every non-optional one.
 *
 * `fallback` is for tables whose columns declare no minimums (the business
 * detail tabs, the plan version list): they keep the number they were given.
 * Columns that DO declare one are the whole answer — a fallback is never
 * mixed in, or a five-column table that needs 634px would be carded at 638.
 */
export function tableMinWidth(columns: TableColumnSizing[], { compact = false, fallback = 0 } = {}): number {
  const shown = columns.filter((c) => !(compact && c.optional));
  const declared = shown.some((c) => c.min !== undefined);
  if (!declared) return fallback;
  const sum = shown.reduce((total, c) => total + columnMin(c), 0);
  return sum + TABLE_COLUMN_GAP_PX * Math.max(0, shown.length - 1) + TABLE_PADDING_X_PX;
}

export function chooseTableLayout({
  boxWidth,
  phone,
  columns,
  fallbackMinWidth = 0,
}: {
  /** The table's border-box width, as `offsetWidth` reports it. */
  boxWidth: number;
  phone: boolean;
  columns: TableColumnSizing[];
  fallbackMinWidth?: number;
}): TableLayout {
  if (phone) return 'cards';
  const inner = boxWidth - TABLE_BORDER_X_PX;
  if (inner >= tableMinWidth(columns, { fallback: fallbackMinWidth })) return 'table';
  if (columns.some((c) => c.optional) && inner >= tableMinWidth(columns, { compact: true, fallback: fallbackMinWidth })) {
    return 'compact';
  }
  return 'cards';
}
