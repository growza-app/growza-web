import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 13 Nov 2026, bug 9 — "Return items" stretched to 96px beside the two stacked receipt buttons at 1440px.
 * Owner, 2026-11-16 — the block is now one column of rows, so nothing stands beside anything taller than itself.
 */
const css = readFileSync(new URL('../../styles/99-orders.css', import.meta.url), 'utf8');

describe('the receipt row keeps each button its own height', () => {
  it('stacks its rows instead of putting buttons side by side, and the return link keeps its own size', () => {
    expect(css).toMatch(/\.ord-d-paper \{[^}]*flex-direction: column;/);
    expect(css).toMatch(/\.ord-d-return-link \{[^}]*align-self: flex-start;/);
  });
});
