import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tenant = join(__dirname, '..');
const read = (p: string) => readFileSync(join(tenant, p), 'utf8');

// The search boxes people use every day, and how many of their `type="search"` inputs must carry the ×.
const BOXES: Array<[string, number]> = [
  ['customers/CustomersClient.tsx', 1],
  ['appointments/BookingsList.tsx', 1],
  ['sales/SalesClient.tsx', 1],
  ['appointments/new/DeskServiceGrid.tsx', 1],
  ['appointments/new/ClientSheet.tsx', 1],
  ['services/ServicesTable.tsx', 2],
  ['providers/StaffClient.tsx', 2],
  ['components/NewVisitSheet.tsx', 1],
];

describe('the × inside a search box', () => {
  it.each(BOXES)('%s carries it', (file, n) => {
    const src = read(file);
    expect(src).toMatch(/import \{ SearchClear \} from '[^']*SearchClear';/);
    expect((src.match(/<SearchClear /g) ?? []).length).toBeGreaterThanOrEqual(n);
  });

  it('shows only while there is text, labels itself, and puts the cursor back', () => {
    const src = read('components/SearchClear.tsx');
    expect(src).toContain("if (value === '') return null;");
    expect(src).toContain("t('clearSearch')");
    expect(src).toContain('box.focus()');
  });

  it('hides the browser’s own × beside it and keeps a 44px tap area', () => {
    const css = read('styles/26-search.css');
    expect(css).toContain("input[type='search']:has(+ .search-clear)::-webkit-search-cancel-button");
    expect(css).toMatch(/\.search-clear \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
  });

  it('has its words in English and Hindi', () => {
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(join(tenant, '../../messages', `${lang}.json`), 'utf8'));
      expect(m.common.clearSearch).toBeTruthy();
    }
  });
});
