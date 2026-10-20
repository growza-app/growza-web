import type { MarketplaceCode, Size } from '../../../lib/api-types';

/**
 * Jira GRW-618 — what the marketplace-codes screen does with a pasted list and with the codes it was sent, as plain
 * functions so the screen only draws them and the rules are tested here.
 *
 * Nothing here decides whether a code is valid or taken: the SERVER does (one code per channel, one size per code, the
 * branch, retired sizes). This tidies what a person pastes into rows the server understands, and says plainly which line
 * of the paste cannot be one.
 */

export const CHANNELS = ['flipkart', 'amazon'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface PasteRow {
  code: string;
  /** The size's name as typed, or null for a one-column list of a product with no sizes. */
  size: string | null;
  /** The line of the paste it came from, 1-based — what a refusal names. */
  line: number;
}

export interface PasteResult {
  rows: PasteRow[];
  /** The lines that cannot be a row: with sizes, a line must say which size its code is for. */
  badLines: number[];
}

/** The words a header row starts with, in either language of the seller panels. */
const HEADER_CODE = new Set(['code', 'fsn', 'asin', 'sku', 'seller sku', 'listing id', 'marketplace code']);

/**
 * "code, size" per line, tidied. The separator is a tab (pasted from a sheet), else a comma, else a semicolon. A header
 * row is skipped. When the product has sizes every line must have two columns; when it has none, one is enough.
 */
export function parsePaste(text: string, sized: boolean): PasteResult {
  const rows: PasteRow[] = [];
  const badLines: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const sep = trimmed.includes('\t') ? '\t' : trimmed.includes(',') ? ',' : trimmed.includes(';') ? ';' : null;
    const cells = (sep === null ? [trimmed] : trimmed.split(sep)).map((c) => c.trim().replace(/^"|"$/g, '').trim());
    const code = cells[0] ?? '';
    const size = (cells[1] ?? '') === '' ? null : cells[1]!;
    if (rows.length === 0 && badLines.length === 0 && HEADER_CODE.has(code.toLowerCase()) && (size === null || size.toLowerCase() === 'size')) return;
    if (code === '' || (sized && size === null)) {
      badLines.push(line);
      return;
    }
    rows.push({ code, size: sized ? size : null, line });
  });
  return { rows, badLines };
}

export interface SizeRow {
  size: Size;
  codes: MarketplaceCode[];
}

/**
 * Each size of the product with the codes it holds, in the owner's order, plus the codes that point at a size which is not
 * on this list any more (retired): kept and shown, never dropped, so the owner can repoint or remove them (FR-06).
 */
export function arrange(sizes: readonly Size[], codes: readonly MarketplaceCode[]): { rows: SizeRow[]; orphans: MarketplaceCode[] } {
  const live = sizes.filter((s) => s.active);
  const byVariant = new Map<string, MarketplaceCode[]>();
  for (const c of codes) if (c.variantId) byVariant.set(c.variantId, [...(byVariant.get(c.variantId) ?? []), c]);
  const shown = new Set(live.map((s) => s.id));
  return {
    rows: live.map((size) => ({ size, codes: byVariant.get(size.id) ?? [] })),
    orphans: codes.filter((c) => c.variantId !== null && !shown.has(c.variantId)),
  };
}

/** How many of the product's sizes have no code on this channel — the plain count the screen leads with. */
export const unmappedCount = (rows: readonly SizeRow[]): number => rows.filter((r) => r.codes.length === 0).length;
