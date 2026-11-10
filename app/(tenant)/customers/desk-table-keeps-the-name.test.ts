import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QA 10 Nov 2026 (device matrix, 1101 and 1112px) — a shop's Customers table on the narrow desk had no room left for the
 * name (0px), and its pager pushed "›" past the card. Measured after: the name ≥115px from 1101 to 1440, nothing past the card.
 */
const css = readFileSync(resolve(__dirname, '../styles/79-desk-clients.css'), 'utf8');
const narrow = css.slice(css.indexOf('@media (min-width: 1101px) and (max-width: 1360px) {'));

describe('the narrow desk keeps the name and the pager inside the card', () => {
  it("drops a shop table's Phone column up to 1360px — the card on the right has the number", () => {
    expect(narrow).toMatch(/\.cust-desk-table:not\(:has\(th:nth-child\(6\)\)\) th:nth-child\(2\),\s*\.cust-desk-table:not\(:has\(th:nth-child\(6\)\)\) td:nth-child\(2\) \{\s*display: none;/);
    // After the rule that re-shows it, so it wins at equal specificity.
    expect(css.indexOf('@media (min-width: 1101px) and (max-width: 1360px) {')).toBeGreaterThan(css.indexOf('display: table-cell;'));
  });

  it('says "Page 1 of 10" between the arrows instead of five numbers', () => {
    expect(narrow).toMatch(/\.cust-desk-table \.pagination-pages \{\s*display: none;/);
    expect(narrow).toMatch(/\.cust-desk-table \.pagination-indicator \{\s*display: inline-flex;/);
    expect(narrow).toMatch(/\.cust-desk-table \.pagination \{\s*flex-wrap: wrap;/);
  });
});
