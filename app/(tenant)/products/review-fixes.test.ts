import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname);
const list = readFileSync(join(dir, 'ProductsList.tsx'), 'utf8');
const sheet = readFileSync(join(dir, 'ProductSheet.tsx'), 'utf8');

describe('review, 2026-10-15 — the Products screen is reachable without a mouse', () => {
  it('the desk table\'s name cell is a real button, not a click on a plain row', () => {
    expect(list).toMatch(/<button[\s\S]{0,80}className="prd-cell-name prd-cell-tap"/);
    expect(list).toMatch(/e\.stopPropagation\(\);\s*if \(writable\) setEditing\(p\);/);
  });
});

describe('review, 2026-10-15 — a photo that fails after a create does not trap Save in a 409', () => {
  it('the created product is kept, a second Save updates it, and closing tells the list', () => {
    expect(sheet).toMatch(/const target = pending \?\? product;/);
    expect(sheet).toMatch(/let saved = target\s*\?\s*await api\.updateProduct\(target\.id, body\)/);
    expect(sheet).toMatch(/setPending\(saved\);/);
    expect(sheet).toMatch(/if \(pending\) onSaved\(pending\);/);
    // Every way out of the sheet goes through the closing that reports it.
    expect(sheet).toMatch(/className="sheet-head-cancel"[^>]*onClick=\{close\}/);
    expect(sheet).toMatch(/modal-backdrop" onClick=\{busy \? undefined : close\}/);
  });
});
