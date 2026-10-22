import type { ProductSizes, Size, SizeAxis, SizeGridCell } from '../../../lib/api-types';
import { sizeLabel } from '../../../lib/till-sizes';

/**
 * Jira GRW-598 — the sizes grid, as plain data and pure functions.
 *
 * Nothing here draws anything. The screen holds a `GridState`, calls these to change it, check it and turn it into
 * the one request the server takes, so every rule the owner meets (what a blank means, what is sent, what is
 * retired) is written once and tested without a browser.
 *
 * The rules that matter, in the owner's words:
 * - **A blank cell is a size you do not stock.** A zero is a size you stock and have none of. They are different.
 * - **A size you blank is retired**, not deleted: it keeps its count and its history.
 * - **Only what you changed is sent.** A count you did not touch is not sent, so a sale made while the screen was
 *   open is not undone by a stale number.
 * - **The order you type is the order everywhere.**
 */

/** The most values one option can have — the server's own limit. */
export const MAX_VALUES = 40;
/** The most options a product can have. */
export const MAX_AXES = 2;

/** Said to the owner as "Size" and "Colour" until they rename them. */
export const DEFAULT_AXIS_NAMES: readonly [string, string] = ['Size', 'Colour'];

/** Common size sets an owner can add in one tap. */
export const SIZE_PRESET_GROUPS: ReadonlyArray<{ id: 'alpha' | 'waist' | 'free'; values: readonly string[] }> = [
  { id: 'alpha', values: ['S', 'M', 'L', 'XL', 'XXL'] },
  { id: 'waist', values: ['28', '30', '32', '34', '36', '38'] },
  { id: 'free', values: ['Free size'] },
];

/** Common colours an owner can tap to add as columns. */
export const COLOUR_PRESETS: readonly string[] = ['Black', 'White', 'Brown', 'Navy', 'Grey', 'Blue', 'Red', 'Green', 'Beige', 'Pink'];

/** One option as the grid holds it — the same shape the server speaks. */
export type GridAxis = SizeAxis;

/** What the server had when the screen loaded: the baseline every "did it change?" is asked against. */
export interface Baseline {
  version: string | null;
  axes: SizeAxis[];
  sizes: Size[];
}

export interface GridState {
  axes: GridAxis[];
  /** The count typed in each cell, by cell key. '' = not stocked. */
  counts: Record<string, string>;
  /** The price typed on each row (a size's price applies to its whole row), by row key. */
  prices: Record<string, string>;
  /** Rows whose price the owner typed into — only these send a price. */
  priceEdited: Record<string, true>;
}

export const norm = (s: string): string => s.trim().toLowerCase();
const GAP = '\u0000';

/** Which combination a cell is — the same key for 'White' and 'white'. */
export const cellKey = (option1: string, option2: string | null): string => `${norm(option1)}${GAP}${norm(option2 ?? '')}`;
export const rowKey = (option1: string): string => norm(option1);

/** "30 / White" — what a message calls a size. */
export const cellLabel = (option1: string, option2: string | null): string => sizeLabel({ option1, option2 });

/** A list the owner typed or pasted — "24, 26, 28" or one per line — as values, in the order typed, each once. */
export function parseValues(text: string): { values: string[]; repeats: number } {
  const seen = new Set<string>();
  const values: string[] = [];
  let repeats = 0;
  for (const raw of text.split(/[\n,;\t]+/)) {
    const v = raw.replace(/\s+/g, ' ').trim();
    if (v === '') continue;
    if (seen.has(norm(v))) {
      repeats += 1;
      continue;
    }
    seen.add(norm(v));
    values.push(v.slice(0, 40));
  }
  return { values, repeats };
}

/** Adds what was pasted after the values already there, once each, up to the limit. */
export function addValues(current: readonly string[], pasted: string): { values: string[]; repeats: number; tooMany: boolean } {
  const parsed = parseValues(pasted);
  const have = new Set(current.map(norm));
  const values = [...current];
  let repeats = parsed.repeats;
  let tooMany = false;
  for (const v of parsed.values) {
    if (have.has(norm(v))) {
      repeats += 1;
      continue;
    }
    if (values.length >= MAX_VALUES) {
      tooMany = true;
      continue;
    }
    have.add(norm(v));
    values.push(v);
  }
  return { values, repeats, tooMany };
}

/** Moves a value one place up (-1) or down (+1) without touching anything else. */
export function moveValue(values: readonly string[], index: number, by: -1 | 1): string[] {
  const to = index + by;
  if (index < 0 || index >= values.length || to < 0 || to >= values.length) return [...values];
  const next = [...values];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

const rupees = (minor: string | null): string => (minor === null ? '' : String(Number(minor) / 100));

/** The grid for a product as the server has it. A product with no sizes starts with one empty option. */
export function initialState(sizes: ProductSizes | null): { state: GridState; baseline: Baseline } {
  const axes: GridAxis[] = sizes && sizes.axes.length > 0 ? sizes.axes.map((a) => ({ name: a.name, values: [...a.values] })) : [{ name: DEFAULT_AXIS_NAMES[0], values: [] }];
  const counts: Record<string, string> = {};
  const prices: Record<string, string> = {};
  const rowPrices = new Map<string, Set<string>>();
  for (const v of sizes?.variants ?? []) {
    counts[cellKey(v.option1, v.option2)] = String(v.stock);
    const row = rowKey(v.option1);
    if (!rowPrices.has(row)) rowPrices.set(row, new Set());
    rowPrices.get(row)!.add(v.priceMinor ?? '');
  }
  // A row's price is shown when all its sizes share one; when they differ it is left blank (and not sent unless typed over).
  for (const [row, set] of rowPrices) prices[row] = set.size === 1 ? rupees([...set][0]! === '' ? null : [...set][0]!) : '';
  return {
    state: { axes, counts, prices, priceEdited: {} },
    baseline: { version: sizes?.version ?? null, axes: sizes?.axes ?? [], sizes: sizes?.variants ?? [] },
  };
}

/** The rows of the grid (first option's values) and its columns (second option's, or one plain column). */
export function layout(state: GridState): { rows: string[]; columns: Array<string | null> } {
  const rows = state.axes[0]?.values ?? [];
  const second = state.axes[1];
  return { rows, columns: second && second.values.length > 0 ? second.values : [null] };
}

/**
 * The sizes that already exist, by cell key — to know what is new, what changed and what a blank retires.
 * When a 1-option product gains a second option (Colour), its existing sizes map to the first colour column.
 */
function existingByKey(baseline: Baseline, state?: GridState): Map<string, Size> {
  const firstCol = state && (state.axes[1]?.values.length ?? 0) > 0 ? state.axes[1]!.values[0]! : null;
  return new Map(baseline.sizes.map((s) => [cellKey(s.option1, s.option2 ?? firstCol), s]));
}

export type CellIssue = 'count' | 'price';

export interface GridProblem {
  /** A cell or a row, so the screen can mark it. */
  key: string;
  issue: CellIssue;
  label: string;
}

/** A count is blank (not stocked) or a whole number from 0 up. */
export const countOk = (text: string): boolean => text.trim() === '' || /^\d{1,7}$/.test(text.trim());
/** A price is blank (the product's own) or a number from 0 up, to the paisa. */
export const priceOk = (text: string): boolean => text.trim() === '' || (/^\d+(\.\d{1,2})?$/.test(text.trim()) && Number(text) <= 1_000_000);

/** What is wrong with the grid, one entry per bad cell, named by its size — nothing is sent while there is any. */
export function problems(state: GridState): GridProblem[] {
  const out: GridProblem[] = [];
  const { rows, columns } = layout(state);
  for (const row of rows) {
    if (!priceOk(state.prices[rowKey(row)] ?? '')) out.push({ key: rowKey(row), issue: 'price', label: row });
    for (const col of columns) {
      const key = cellKey(row, col);
      if (!countOk(state.counts[key] ?? '')) out.push({ key, issue: 'count', label: cellLabel(row, col) });
    }
  }
  return out;
}

/**
 * True when the save would carry at least one size: a style with no sizes stocked is not a style. Asked of the request
 * itself, so an untouched retired size's old count does not make a blank grid look stocked.
 */
export function anyStocked(state: GridState, baseline: Baseline): boolean {
  return toRequest(state, baseline).cells.length > 0;
}

/** What may be typed in a count box: digits, and a point so a decimal is SEEN (and refused) instead of quietly becoming a bigger number. */
export const cleanCount = (text: string): string => text.replace(/[^\d.]/g, '').slice(0, 8);

/** What may be typed in a price box. */
export const cleanPrice = (text: string): string => text.replace(/[^\d.]/g, '').slice(0, 10);

/** The price a row had when the screen loaded, in rupees ('' for the product's own). Mixed rows read as ''. */
function loadedRowPrice(baseline: Baseline, row: string): string {
  const prices = new Set(baseline.sizes.filter((s) => rowKey(s.option1) === rowKey(row)).map((s) => s.priceMinor ?? ''));
  return prices.size === 1 ? rupees([...prices][0]! === '' ? null : [...prices][0]!) : '';
}

/** A price typed on a row. Only a price that differs from what the row had counts as an edit: typing it back is no change. */
export function setPriceText(state: GridState, baseline: Baseline, row: string, text: string): GridState {
  const key = rowKey(row);
  const edited = { ...state.priceEdited };
  const mixed = new Set(baseline.sizes.filter((s) => rowKey(s.option1) === key).map((s) => s.priceMinor ?? '')).size > 1;
  if (!mixed && text.trim() === loadedRowPrice(baseline, row)) delete edited[key];
  else edited[key] = true;
  return { ...state, prices: { ...state.prices, [key]: text }, priceEdited: edited };
}

/** Takes a value out of an option, with its counts (and, for a size, its price). The screen offers this only for a value no size has. */
export function removeValue(state: GridState, axisIndex: 0 | 1, value: string): GridState {
  const gone = norm(value);
  const axes = state.axes.map((a, at) => (at === axisIndex ? { ...a, values: a.values.filter((v) => norm(v) !== gone) } : a));
  const counts = Object.fromEntries(Object.entries(state.counts).filter(([key]) => key.split(GAP)[axisIndex] !== gone));
  const prices = { ...state.prices };
  const priceEdited = { ...state.priceEdited };
  if (axisIndex === 0) {
    delete prices[gone];
    delete priceEdited[gone];
  }
  return { ...state, axes, counts, prices, priceEdited };
}

/** A second option, empty, named Colour until the owner renames it. */
export function addSecondAxis(state: GridState): GridState {
  if (state.axes.length > 1) return state;
  return { ...state, axes: [...state.axes.slice(0, 1), { name: DEFAULT_AXIS_NAMES[1], values: [] }] };
}

/**
 * Adds values to an option (creating the second option if needed). When the first colour is added to a 1-option grid,
 * any counts already in the plain size rows move into that first colour column so nothing vanishes.
 */
export function addAxisValues(state: GridState, axisIndex: 0 | 1, pasted: string): { state: GridState; repeats: number; tooMany: boolean } {
  const withAxis = axisIndex === 1 && state.axes.length === 1 ? addSecondAxis(state) : state;
  const axis = withAxis.axes[axisIndex] ?? { name: DEFAULT_AXIS_NAMES[axisIndex], values: [] };
  const hadSecondValues = axisIndex === 1 && axis.values.length > 0;
  const r = addValues(axis.values, pasted);
  const axes = withAxis.axes.map((a, at) => (at === axisIndex ? { ...a, values: r.values } : a));
  const counts = { ...withAxis.counts };
  if (axisIndex === 1 && !hadSecondValues && r.values.length > 0) {
    const firstCol = r.values[0]!;
    for (const row of axes[0]?.values ?? []) {
      const plainKey = cellKey(row, null);
      const colKey = cellKey(row, firstCol);
      if ((counts[plainKey] ?? '') !== '' && (counts[colKey] ?? '') === '') {
        counts[colKey] = counts[plainKey]!;
        delete counts[plainKey];
      }
    }
  }
  return { state: { ...withAxis, axes, counts }, repeats: r.repeats, tooMany: r.tooMany };
}

/** Takes the second option away, with every count that was in a colour column (restoring 1-option baseline counts when present). */
export function removeSecondAxis(state: GridState, baseline?: Baseline): GridState {
  const counts = Object.fromEntries(Object.entries(state.counts).filter(([key]) => (key.split(GAP)[1] ?? '') === ''));
  if (baseline && baseline.axes.length === 1) {
    for (const s of baseline.sizes) {
      if (s.option2 === null) counts[cellKey(s.option1, null)] = String(s.stock);
    }
  }
  return { ...state, axes: state.axes.slice(0, 1), counts };
}

/**
 * Whether a second option is blocked. Since saving a second option now upgrades existing 1-option sizes into the first
 * colour column, a second option can always be added when the product has only one option.
 */
export const secondOptionBlocked = (_state: GridState, _baseline: Baseline): boolean => false;

/** Sizes that exist and are on the shelf now but whose cell is blank: saving retires them. */
export function willRetire(state: GridState, baseline: Baseline): Size[] {
  const stocked = new Set<string>();
  const { rows, columns } = layout(state);
  const firstCol = (state.axes[1]?.values.length ?? 0) > 0 ? state.axes[1]!.values[0]! : null;
  for (const row of rows) for (const col of columns) if ((state.counts[cellKey(row, col)] ?? '').trim() !== '') stocked.add(cellKey(row, col));
  return baseline.sizes.filter((s) => s.active && !stocked.has(cellKey(s.option1, s.option2 ?? firstCol)));
}

/** The axes as the server takes them: named, each value once, in order. */
function requestAxes(state: GridState): SizeAxis[] {
  return state.axes.filter((a) => a.values.length > 0).map((a) => ({ name: a.name.trim() || DEFAULT_AXIS_NAMES[state.axes.indexOf(a)] || DEFAULT_AXIS_NAMES[0], values: a.values }));
}

/**
 * The one request. A cell is sent for every size that is stocked (so it stays on the shelf); its COUNT only if it is
 * new or the owner changed it, and its PRICE only if the owner typed into its row. A retired size the owner did not
 * touch is left out, which keeps it retired; a size on the shelf with a blank cell is left out, which retires it.
 */
export function toRequest(state: GridState, baseline: Baseline): { axes: SizeAxis[]; cells: SizeGridCell[]; version?: string } {
  const byKey = existingByKey(baseline, state);
  const { rows, columns } = layout(state);
  const cells: SizeGridCell[] = [];
  for (const row of rows) {
    for (const col of columns) {
      const key = cellKey(row, col);
      const typed = (state.counts[key] ?? '').trim();
      if (typed === '') continue;
      const was = byKey.get(key);
      const count = Number(typed);
      // A retired size comes back only when the owner changed its count; left alone it stays retired.
      if (was && !was.active && count === was.stock) continue;
      const cell: SizeGridCell = { option1: row, ...(col !== null ? { option2: col } : {}) };
      if (!was || count !== was.stock) cell.stock = count;
      if (state.priceEdited[rowKey(row)]) {
        const p = (state.prices[rowKey(row)] ?? '').trim();
        cell.priceMinor = p === '' ? null : Math.round(Number(p) * 100);
      }
      cells.push(cell);
    }
  }
  return { axes: requestAxes(state), cells, ...(baseline.version ? { version: baseline.version } : {}) };
}

/** Whether anything differs from what the server has — the Save bar lights only for a real change. */
export function isDirty(state: GridState, baseline: Baseline): boolean {
  const same = (a: GridAxis[], b: SizeAxis[]) => a.length === b.length && a.every((x, i) => x.name === b[i]!.name && x.values.length === b[i]!.values.length && x.values.every((v, j) => v === b[i]!.values[j]));
  const current = state.axes.filter((a) => a.values.length > 0);
  if (!same(current, baseline.axes)) return true;
  if (Object.keys(state.priceEdited).length > 0) return true;
  const { rows, columns } = layout(state);
  const byKey = existingByKey(baseline, state);
  const firstCol = (state.axes[1]?.values.length ?? 0) > 0 ? state.axes[1]!.values[0]! : null;
  const stocked = new Set<string>();
  for (const row of rows) {
    for (const col of columns) {
      const key = cellKey(row, col);
      const typed = (state.counts[key] ?? '').trim();
      const was = byKey.get(key);
      if (typed !== '') stocked.add(key);
      if (typed !== '' && (!was || Number(typed) !== was.stock)) return true;
    }
  }
  return baseline.sizes.some((s) => s.active && !stocked.has(cellKey(s.option1, s.option2 ?? firstCol)));
}

/** Values that already have a size on them: the owner may not take these out of the option (retire the size instead). */
export function lockedValues(baseline: Baseline, axisIndex: 0 | 1): Set<string> {
  return new Set(baseline.sizes.map((s) => norm(axisIndex === 0 ? s.option1 : (s.option2 ?? ''))).filter((v) => v !== ''));
}
