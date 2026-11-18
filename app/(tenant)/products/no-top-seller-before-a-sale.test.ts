import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-736 — fix: QA of the overnight stack (item 12). A new menu said "Top seller: Butter Naan · 0 sold". The top
 * seller is picked from dishes that have sold; with none, the tile says what has sold across the menu instead.
 */
const src = readFileSync(resolve(__dirname, 'ProductsList.tsx'), 'utf8');

describe('no top seller until something has sold', () => {
  it('picks only from dishes with a sale', () => {
    expect(src).toContain('const selling = live.filter((p) => p.sold > 0);');
    const memo = src.slice(src.indexOf('const topSeller = useMemo('), src.indexOf('}, [live]);'));
    expect(memo).not.toMatch(/\[\.\.\.live\]/);
  });

  it('with none, the tile falls back to what sold across the menu', () => {
    expect(src).toContain("{topSeller ? t('topSeller') : t('cols.sold')}");
  });
});
