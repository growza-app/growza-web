import type { ProductSizes, SizeAxis, SizeGridCell } from '../../../lib/api-types';
import { norm } from './grid-model';

/**
 * A dish's portions — the Sizes screen for a business that does not count what it sells (a kitchen).
 *
 * The owner sees one list: each portion's name and its price, a bin to take one off, a button to add one. Under it is the
 * same sizes write the retail grid uses (`saveSizeGrid`), stated as the whole picture: every portion on the list is a
 * cell, and a portion that has left the list is simply not sent, which retires it (its sales history stays). Nothing here
 * sends a count. A new portion starts at 0 — the count every dish's sizes carry — and an existing one's count is left out.
 *
 * The server keeps a value with a size on it in the option for good, so a removed portion's name stays in the axis while
 * its cell goes; typing that name again brings the same size back rather than making a second one.
 */

export interface PortionRow {
  /** Stable while the screen is open: React's key, and how a typed name finds its row. */
  id: string;
  name: string;
  /** Rupees as typed. */
  price: string;
  /** True for a portion the dish already had when the screen loaded: its name is fixed (renaming would make a new size). */
  saved: boolean;
  /** True for a row from "Type my own": the only kind whose name is a box to type in. A preset's name is already known. */
  typed?: boolean;
}

export const MAX_PORTIONS = 40;
export const MAX_PORTION_NAME = 40;

export const PORTION_PRESETS = {
  halfFull: ['Half', 'Full'],
  cups: ['Small', 'Medium', 'Large'],
} as const;

const rupees = (minor: string | null): string => {
  if (minor === null || minor === '') return '';
  const n = Number(minor) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

let next = 0;
export const newRowId = (): string => `new-${++next}`;

/** The portions on sale now, in the dish's own order, each with the price it sells at. */
export function portionsFrom(sizes: ProductSizes): PortionRow[] {
  const order = sizes.axes[0]?.values ?? [];
  const live = sizes.variants.filter((v) => v.active && v.option2 === null);
  const at = (name: string) => {
    const i = order.findIndex((o) => norm(o) === norm(name));
    return i < 0 ? order.length : i;
  };
  return [...live]
    .sort((a, b) => at(a.option1) - at(b.option1))
    .map((v) => ({ id: v.id, name: v.option1, price: rupees(v.priceMinor ?? sizes.product.priceMinor), saved: true }));
}

/** New rows for a preset, skipping any name already on the list. */
export function addPreset(rows: readonly PortionRow[], names: readonly string[]): PortionRow[] {
  const have = new Set(rows.map((r) => norm(r.name)));
  const added = names.filter((n) => !have.has(norm(n))).map((name) => ({ id: newRowId(), name, price: '', saved: false }));
  return [...rows, ...added].slice(0, MAX_PORTIONS);
}

export type PortionProblem =
  | { kind: 'none' }
  | { kind: 'name'; id: string }
  | { kind: 'price'; id: string; name: string }
  | { kind: 'twice'; id: string; name: string }
  | { kind: 'tooLong'; id: string };

const PRICE = /^\d{1,7}(\.\d{1,2})?$/;

/** The first thing wrong with the list, in the order the owner reads it — or that the list is empty. */
export function firstProblem(rows: readonly PortionRow[]): PortionProblem | null {
  if (rows.length === 0) return { kind: 'none' };
  const seen = new Set<string>();
  for (const r of rows) {
    const name = r.name.trim();
    if (name === '') return { kind: 'name', id: r.id };
    if (name.length > MAX_PORTION_NAME) return { kind: 'tooLong', id: r.id };
    if (seen.has(norm(name))) return { kind: 'twice', id: r.id, name };
    seen.add(norm(name));
    const price = r.price.trim();
    if (!PRICE.test(price) || Number(price) <= 0) return { kind: 'price', id: r.id, name };
  }
  return null;
}

/** Whether the list differs from what the dish has now. */
export function portionsChanged(rows: readonly PortionRow[], loaded: readonly PortionRow[]): boolean {
  if (rows.length !== loaded.length) return true;
  return rows.some((r, i) => norm(r.name) !== norm(loaded[i]!.name) || Number(r.price) !== Number(loaded[i]!.price) || r.price.trim() === '');
}

/**
 * The one request. The axis keeps every value that already has a size (the server refuses to drop one) plus the new names;
 * a portion on the list is a cell with its price; a portion off the list has no cell and is retired. A typed name that
 * matches a retired size — any case — uses that size's own spelling, so it comes back instead of being made twice.
 */
export function portionsRequest(rows: readonly PortionRow[], sizes: ProductSizes): { axes: SizeAxis[]; cells: SizeGridCell[]; version?: string } {
  const existing = new Map(sizes.variants.filter((v) => v.option2 === null).map((v) => [norm(v.option1), v]));
  const axisName = sizes.axes[0]?.name?.trim() || 'Size';
  const values = [...(sizes.axes[0]?.values ?? [])];
  const cells: SizeGridCell[] = [];
  for (const r of rows) {
    const was = existing.get(norm(r.name));
    const name = was ? was.option1 : r.name.trim().replace(/\s+/g, ' ');
    if (!values.some((v) => norm(v) === norm(name))) values.push(name);
    const cell: SizeGridCell = { option1: name, priceMinor: Math.round(Number(r.price) * 100) };
    if (!was) cell.stock = 0;
    cells.push(cell);
  }
  return { axes: [{ name: axisName, values }], cells, ...(sizes.version ? { version: sizes.version } : {}) };
}
