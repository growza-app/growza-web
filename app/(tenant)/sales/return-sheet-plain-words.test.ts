import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Returns QA 13 Nov 2026 — the return sheet said "that size's count" over a Chess Set, which has no sizes. */
const sheet = readFileSync(new URL('./ReturnProductSheet.tsx', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8'));
const hi = JSON.parse(readFileSync(new URL('../../../messages/hi.json', import.meta.url), 'utf8'));

describe('putting a return back says shelf or size, whichever it is', () => {
  it('names the size only when a size is coming back', () => {
    expect(sheet).toContain("t(selectedLines.some(({ line }) => line.variantId) ? 'restockShelfHint' : 'restockShelfHintPlain')");
  });
  it('has the plain words in both languages', () => {
    expect(en.sales.returnSheet.restockShelfHintPlain).toBe('Adds the units back to the shelf count');
    expect(hi.sales.returnSheet.restockShelfHintPlain).toBe('शेल्फ़ की गिनती में वापस जोड़ता है');
  });
});
