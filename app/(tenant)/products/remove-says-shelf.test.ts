import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/** QA 2026-11-14 (F12) — removing 99 with 8 on the shelf said "Only 8 here to move". A removal says the shelf. */
const panel = readFileSync(new URL('./StockPanel.tsx', import.meta.url), 'utf8');

describe('too many to take off the shelf', () => {
  it('a transfer keeps its sentence; a removal says what is on the shelf', () => {
    expect(panel).toContain("const tooManyKey = kind === 'transfer' ? 'transfer.tooMany' : 'tooManyOnShelf';");
    expect(panel).toContain('t(tooManyKey, { n: Math.max(product.stock, 0) })');
    expect(en.products.ledger.tooManyOnShelf).toBe('Only {n} on the shelf');
    expect(hi.products.ledger.tooManyOnShelf).toContain('{n}');
    expect(en.products.ledger.transfer.tooMany).toBe('Only {n} here to move');
  });
});
