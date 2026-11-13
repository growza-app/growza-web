import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** QA 13 Nov 2026, bug 9 — "Return items" stretched to 96px beside the two stacked receipt buttons at 1440px. */
const css = readFileSync(new URL('../../styles/99-orders.css', import.meta.url), 'utf8');

describe('the receipt row keeps each button its own height', () => {
  it('top-aligns instead of stretching', () => {
    expect(css).toMatch(/\.ord-d-paper \{[^}]*align-items: flex-start;/);
  });
});
