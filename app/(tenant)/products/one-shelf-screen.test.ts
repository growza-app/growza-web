import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** QA 13 Nov 2026, bug 14 — a restaurant read "Customers" on its Home tiles and "Products" on a typed-in /products. */
const screen = readFileSync(new URL('./ProductsScreen.tsx', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../lib/home-copy.ts', import.meta.url), 'utf8');

describe('a shop or kitchen has one shelf screen and its own words', () => {
  it('sends /products to /stock for a business that sells from /stock, keeping branch and filter', () => {
    expect(screen).toContain("if (guard === '/products' && areasOf(me).shop) {");
    expect(screen).toContain("redirect(q.size ? `/stock?${q.toString()}` : '/stock');");
  });
  it('the Home customers tile takes the vertical word', () => {
    expect(copy).toContain("customersCardTitle: S(clientsWord, 'ग्राहक'),");
  });
});
