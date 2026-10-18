import type { Product, ProductImportItem } from '../lib/api-types';

/**
 * Owner, 2026-10-18 — a shelf loaded from a spreadsheet.
 *
 * Pure, because what goes wrong with a file of three hundred products is a column read as the wrong thing, a code
 * Excel has quietly turned into a number, or two rows that are one product — and every one of those is cheap to pin
 * here and expensive to find after the import. The API checks the same rules again; this is where the owner can fix
 * the row, with the file still open.
 */

export type Field = 'name' | 'price' | 'stock' | 'barcode' | 'sku' | 'category' | 'gst' | 'hsn' | 'cost' | 'lowStock';

/** `field → column index` in the owner's file; -1 is "not in the file". */
export type ColumnMap = Record<Field, number>;

/**
 * In the order the owner is asked about them. `hints` are header words to recognise, whole words, lower case, in
 * English as the files usually are.
 */
export const FIELDS: { key: Field; required: boolean; hints: string[] }[] = [
  { key: 'name', required: true, hints: ['product name', 'product', 'name', 'item name', 'item', 'description', 'title', 'particulars'] },
  { key: 'price', required: true, hints: ['mrp', 'selling price', 'selling', 'sale price', 'price', 'rate', 'amount', 'sp'] },
  { key: 'stock', required: false, hints: ['stock', 'qty', 'quantity', 'opening', 'on hand', 'units', 'count'] },
  { key: 'barcode', required: false, hints: ['barcode', 'bar code', 'ean', 'upc', 'gtin'] },
  { key: 'sku', required: false, hints: ['sku', 'item code', 'product code', 'article code', 'article no'] },
  { key: 'category', required: false, hints: ['category', 'group', 'type', 'department', 'section'] },
  { key: 'gst', required: false, hints: ['gst', 'igst', 'tax rate', 'tax', 'vat'] },
  { key: 'hsn', required: false, hints: ['hsn', 'sac'] },
  { key: 'cost', required: false, hints: ['cost price', 'cost', 'purchase', 'buying', 'cp'] },
  { key: 'lowStock', required: false, hints: ['low stock', 'reorder', 'min stock', 'minimum', 'threshold', 'alert'] },
];

/**
 * Which field claims a column first. A column is claimed once, so the narrow ones go before the wide ones: "Cost
 * Price" is the cost before it is the price, "Item Code" the SKU before "item" makes it the name, and "Low stock"
 * the alert line before "stock" makes it the count.
 */
const CLAIM_ORDER: Field[] = ['barcode', 'hsn', 'sku', 'gst', 'lowStock', 'stock', 'cost', 'price', 'name', 'category'];

const words = (header: string) => header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const hasHint = (header: string, hint: string) => new RegExp(`(^| )${hint}( |$)`).test(words(header));

/** Best-guess mapping so a conventionally named sheet needs no work at all. */
export function suggest(headers: string[]): ColumnMap {
  const used = new Set<number>();
  const out = {} as ColumnMap;
  for (const key of FIELDS.map((f) => f.key)) out[key] = -1;
  for (const key of CLAIM_ORDER) {
    const field = FIELDS.find((f) => f.key === key)!;
    const i = headers.findIndex((h, idx) => !used.has(idx) && field.hints.some((hint) => hasHint(h, hint)));
    out[key] = i;
    if (i >= 0) used.add(i);
  }
  return out;
}

/** What column `i` becomes, or null when it is not used. */
export function fieldAt(map: ColumnMap, i: number): Field | null {
  return FIELDS.find((f) => map[f.key] === i)?.key ?? null;
}

/** Column `i` becomes `field` (or nothing, with null); a field that another column held moves, so one field never reads two columns. */
export function withColumnAs(map: ColumnMap, i: number, field: Field | null): ColumnMap {
  const next = { ...map };
  for (const f of FIELDS) if (next[f.key] === i) next[f.key] = -1;
  if (field) next[field] = i;
  return next;
}

export const missingRequired = (map: ColumnMap): Field[] => FIELDS.filter((f) => f.required && map[f.key] < 0).map((f) => f.key);
export const matchedAll = (map: ColumnMap): boolean => missingRequired(map).length === 0;

/* ------------------------------------------------------------------ drafts */

/** Why a row is not going onto the shelf — a key of `products.import.skipped`, said in the owner's language after the import too. */
export type SkipReason = 'negativePrice' | 'negativeStock' | 'negativeCost' | 'negativeLowStock' | 'negativeGst' | 'repeat' | 'owner';

/** One row of the file on its way onto the shelf. Every cell is the text the owner can see and fix. */
export interface ProductDraft {
  /** Its number among the file's rows (the header is not one) — what the owner finds in their spreadsheet and what an error names. */
  row: number;
  name: string;
  price: string;
  stock: string;
  barcode: string;
  sku: string;
  category: string;
  /** A percent as typed: "18", "18%". */
  gst: string;
  hsn: string;
  cost: string;
  lowStock: string;
  /** The product already on this branch's shelf that this row is, or null for a new one. */
  existing: Product | null;
  skip: boolean;
  /** Set whenever `skip` is, so the owner is told why the row is not going in. */
  skipReason: SkipReason | null;
}

/**
 * A number as typed in a cell: "₹1,250" is 1250, "12 pcs" is 12, "-3" and "(3)" are negative, and text with no number
 * in it is kept as typed so the row says "must be a number" rather than "needs a price". The minus sign is kept ON
 * PURPOSE: stripping it turned a stock of -3 into 3 and imported it. "Rs 99/-" is Indian for "99 only", not negative.
 */
export function plainNumber(raw: string): string {
  const t = raw.trim();
  if (!t || /^[-−–—]$/.test(t) || /^n\/?a$/i.test(t)) return '';
  const digits = t.replace(/[^\d.]/g, '');
  if (!digits) return t;
  const negative = /^[^\d.]*[-−–]\s*[\d.]/.test(t) || /^\(.*\d.*\)$/.test(t);
  return negative ? `-${digits}` : digits;
}

/** "18", "18%", " 18 % " → "18"; a minus sign and anything else are left for the problem check to name. */
export const plainPercent = (raw: string): string => raw.replace(/[%\s]/g, '').replace(/[−–]/g, '-');

const isNegative = (s: string) => /^-\s*\d/.test(s.trim());

export function blankDraft(): ProductDraft {
  return { row: 0, name: '', price: '', stock: '', barcode: '', sku: '', category: '', gst: '', hsn: '', cost: '', lowStock: '', existing: null, skip: false, skipReason: null };
}

/** The shelf's own lookup: a barcode first (the surest), then a SKU, then the name. Retired products are found by name only — their codes are free. */
export function matchExisting(d: Pick<ProductDraft, 'name' | 'barcode' | 'sku'>, shelf: readonly Product[]): Product | null {
  const barcode = d.barcode.trim().toLowerCase();
  if (barcode) {
    const hit = shelf.find((p) => p.active && p.barcode?.toLowerCase() === barcode);
    if (hit) return hit;
  }
  const sku = d.sku.trim().toLowerCase();
  if (sku) {
    const hit = shelf.find((p) => p.active && p.sku?.toLowerCase() === sku);
    if (hit) return hit;
  }
  const name = d.name.trim().toLowerCase();
  return name ? (shelf.find((p) => p.name.trim().toLowerCase() === name) ?? null) : null;
}

/** The negative cell that keeps a row off the shelf, in the order the owner would read the row. */
function negativeReason(d: ProductDraft): SkipReason | null {
  if (isNegative(d.price)) return 'negativePrice';
  if (isNegative(d.stock)) return 'negativeStock';
  if (isNegative(d.cost)) return 'negativeCost';
  if (isNegative(d.lowStock)) return 'negativeLowStock';
  if (isNegative(d.gst)) return 'negativeGst';
  return null;
}

/**
 * The file's rows as drafts. A row with a negative number is NOT imported — it starts skipped, with the reason, and
 * is listed after the import; the owner can include it and fix the number. A product named twice starts skipped for
 * its repeat.
 */
export function buildDrafts(rows: string[][], map: ColumnMap, shelf: readonly Product[]): ProductDraft[] {
  const at = (r: string[], key: Field) => (map[key] >= 0 ? (r[map[key]] ?? '').trim() : '');
  const seen = new Set<string>();
  return rows.map((r, index) => {
    const draft: ProductDraft = {
      row: index + 1,
      name: at(r, 'name'),
      price: plainNumber(at(r, 'price')),
      stock: plainNumber(at(r, 'stock')),
      barcode: at(r, 'barcode'),
      sku: at(r, 'sku'),
      category: at(r, 'category'),
      gst: plainPercent(at(r, 'gst')),
      hsn: at(r, 'hsn'),
      cost: plainNumber(at(r, 'cost')),
      lowStock: plainNumber(at(r, 'lowStock')),
      existing: null,
      skip: false,
      skipReason: null,
    };
    draft.existing = matchExisting(draft, shelf);
    const negative = negativeReason(draft);
    if (negative) {
      draft.skip = true;
      draft.skipReason = negative;
      return draft;
    }
    const key = draft.existing?.id ?? `new:${draft.name.toLowerCase()}`;
    if (draft.name || draft.existing) {
      if (seen.has(key)) {
        draft.skip = true;
        draft.skipReason = 'repeat';
      }
      seen.add(key);
    }
    return draft;
  });
}

/* ---------------------------------------------------------------- problems */

/** A key of `products.import.problems`, so the screen says it in the owner's language. */
export type ProductProblem =
  | 'needsName'
  | 'needsPrice'
  | 'priceNotNumber'
  | 'stockNotWhole'
  | 'costNotNumber'
  | 'lowNotWhole'
  | 'gstNotNumber'
  | 'gstRange'
  | 'hsnDigits'
  | 'barcodeSpaces'
  | 'barcodeScientific'
  | 'tooLong'
  | 'tooLarge'
  | 'negative'
  | 'twice'
  | 'barcodeTaken'
  | 'skuTaken';

const isNumber = (s: string) => /^\d+(\.\d+)?$/.test(s);
const isWhole = (s: string) => /^\d+$/.test(s);
/** Excel turns a 13-digit barcode into 8.9012E+12 when it saves a CSV — the digits are gone, and no reader can get them back. */
const SCIENTIFIC = /^\d(\.\d+)?e\+?\d+$/i;

/** The most the API takes: a price or cost of ₹10,00,000 and a count of 1,000,000 (the same limits as the product sheet). */
const MAX_RUPEES = 1_000_000;
const MAX_COUNT = 1_000_000;

/** What is wrong with one row on its own, or null. */
export function rowProblem(d: ProductDraft): ProductProblem | null {
  if (!d.existing && !d.name.trim()) return 'needsName';
  if (d.name.trim().length > 120 || d.category.trim().length > 60 || d.sku.trim().length > 40 || d.barcode.trim().length > 64) return 'tooLong';
  if ([d.price, d.stock, d.cost, d.lowStock, d.gst].some(isNegative)) return 'negative';
  if (d.price.trim() === '') {
    if (!d.existing) return 'needsPrice';
  } else if (!isNumber(d.price.trim())) return 'priceNotNumber';
  if (d.stock.trim() && !isWhole(d.stock.trim())) return 'stockNotWhole';
  if (d.cost.trim() && !isNumber(d.cost.trim())) return 'costNotNumber';
  if (d.lowStock.trim() && !isWhole(d.lowStock.trim())) return 'lowNotWhole';
  if (d.gst.trim()) {
    if (!isNumber(d.gst.trim())) return 'gstNotNumber';
    if (Number(d.gst) > 28) return 'gstRange';
  }
  if (Number(d.price) > MAX_RUPEES || Number(d.cost) > MAX_RUPEES || Number(d.stock) > MAX_COUNT || Number(d.lowStock) > MAX_COUNT) return 'tooLarge';
  if (d.hsn.trim() && !/^\d{4,8}$/.test(d.hsn.trim())) return 'hsnDigits';
  if (SCIENTIFIC.test(d.barcode.trim())) return 'barcodeScientific';
  if (d.barcode.trim() && !/^[!-~]+$/.test(d.barcode.trim())) return 'barcodeSpaces';
  return null;
}

/**
 * Every row's problem, with the ones that only show across rows: the same product twice, or a code another product
 * already holds. A skipped row is not going to be saved, so it neither has a problem nor causes one. The same
 * bookkeeping as the API's: a retired product holds no code, and a row that moves a product off a code frees it
 * for the rows after.
 */
export function reviewProblems(drafts: readonly ProductDraft[], shelf: readonly Product[]): (ProductProblem | null)[] {
  const ownerOf = { barcode: new Map<string, string>(), sku: new Map<string, string>() };
  const held = new Map<string, { barcode: string | null; sku: string | null }>();
  for (const p of shelf) {
    if (!p.active) continue;
    held.set(p.id, { barcode: p.barcode?.toLowerCase() ?? null, sku: p.sku?.toLowerCase() ?? null });
    if (p.barcode) ownerOf.barcode.set(p.barcode.toLowerCase(), p.id);
    if (p.sku) ownerOf.sku.set(p.sku.toLowerCase(), p.id);
  }
  const seenProduct = new Set<string>();
  return drafts.map((d, index) => {
    if (d.skip) return null;
    const alone = rowProblem(d);
    if (alone) return alone;
    const key = d.existing?.id ?? `new:${d.name.trim().toLowerCase()}`;
    if (seenProduct.has(key)) return 'twice';
    seenProduct.add(key);
    // A retired product holds no code, so correcting one neither clashes nor claims.
    if (d.existing && !held.has(d.existing.id)) return null;
    const self = d.existing?.id ?? `row-${index}`;
    for (const code of ['barcode', 'sku'] as const) {
      const value = d[code].trim().toLowerCase();
      if (!value) continue;
      const holder = ownerOf[code].get(value);
      if (holder && holder !== self) return code === 'barcode' ? 'barcodeTaken' : 'skuTaken';
      const old = d.existing ? held.get(d.existing.id)?.[code] : null;
      if (old && old !== value) ownerOf[code].delete(old);
      ownerOf[code].set(value, self);
      if (d.existing) held.get(d.existing.id)![code] = value;
    }
    return null;
  });
}

/* ------------------------------------------------------------------- items */

const minor = (rupees: string) => Math.round(Number(rupees) * 100);

/** What goes to the API. A correction carries only the cells the file filled, and never the count: a count changes through the ledger. */
export function toItems(drafts: readonly ProductDraft[]): ProductImportItem[] {
  return drafts
    .filter((d) => !d.skip)
    .map((d): ProductImportItem => {
      const item: ProductImportItem = d.existing ? { mode: 'update', row: d.row, existingId: d.existing.id } : { mode: 'create', row: d.row, name: d.name.trim() };
      if (d.price.trim()) item.priceMinor = minor(d.price.trim());
      if (d.cost.trim()) item.costMinor = minor(d.cost.trim());
      if (d.lowStock.trim()) item.lowStockAt = Number(d.lowStock);
      if (d.category.trim()) item.categoryName = d.category.trim();
      if (d.sku.trim()) item.sku = d.sku.trim();
      if (d.barcode.trim()) item.barcode = d.barcode.trim();
      if (d.gst.trim()) item.gstRateBp = Math.round(Number(d.gst) * 100);
      if (d.hsn.trim()) item.hsn = d.hsn.trim();
      if (!d.existing && d.stock.trim()) item.stock = Number(d.stock);
      return item;
    });
}

export interface ImportCounts {
  create: number;
  update: number;
  skipped: number;
  fix: number;
}

export function countDrafts(drafts: readonly ProductDraft[], problems: readonly (ProductProblem | null)[]): ImportCounts {
  return {
    create: drafts.filter((d) => !d.skip && !d.existing).length,
    update: drafts.filter((d) => !d.skip && d.existing).length,
    skipped: drafts.filter((d) => d.skip).length,
    fix: problems.filter((p) => p !== null).length,
  };
}

/** Most new categories one file may make — the API refuses more, so the review says so first. */
export const MAX_NEW_CATEGORIES = 50;

/** The categories this file would make, in the order it first names them; one that is already on the shelf is not new. */
export function newCategoryNames(drafts: readonly ProductDraft[], existing: readonly string[]): string[] {
  const known = new Set(existing.map((n) => n.trim().toLowerCase()));
  const out = new Map<string, string>();
  for (const d of drafts) {
    const name = d.category.trim();
    const key = name.toLowerCase();
    if (d.skip || !name || known.has(key) || out.has(key)) continue;
    out.set(key, name);
  }
  return [...out.values()];
}

/** Rows that match a product already on the shelf and carry a stock number: the number is not used, and the owner is told. */
export const stockNotApplied = (drafts: readonly ProductDraft[]): number => drafts.filter((d) => !d.skip && d.existing && d.stock.trim() !== '').length;

/** The rows that did not go in, with why — shown while reviewing and again after the import. */
export function notImported(drafts: readonly ProductDraft[]): { row: number; name: string; reason: SkipReason }[] {
  return drafts.filter((d) => d.skip && d.skipReason).map((d) => ({ row: d.row, name: d.name.trim() || d.existing?.name || '', reason: d.skipReason! }));
}

/** How the owner's columns were read, for the check after the import: each column with what it became, and the ones not used. */
export function mappingSummary(headers: readonly string[], map: ColumnMap): { used: { column: string; field: Field }[]; unused: string[] } {
  const label = (i: number) => headers[i] || '';
  const used: { column: string; field: Field }[] = [];
  const unused: string[] = [];
  headers.forEach((_, i) => {
    const field = fieldAt(map, i);
    if (field) used.push({ column: label(i), field });
    else unused.push(label(i));
  });
  return { used, unused };
}

/** A starter file: the headers the importer recognises, and one row to show how a line looks. */
export const SAMPLE_CSV = 'Product name,Barcode,Price,Stock,GST %,HSN,Cost,SKU,Category,Low stock\nArgan Hair Oil 100ml,8901234567890,450,12,18,33059090,300,ARG-100,Hair care,3\n';
