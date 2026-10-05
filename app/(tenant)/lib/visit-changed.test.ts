import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Record payment and Mark done refresh the page without a timer.
 *
 * `router.refresh()` re-reads what the server rendered, but Owner Home's money and client cards (and the
 * branch carousel's figures) are held in the browser, so they kept the old numbers until a reload. Each
 * sheet announces the change; Home re-reads on it. Nothing polls.
 */
const here = (p: string) => readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), p), 'utf-8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('a visit changing refreshes Home on its own', () => {
  it('every sheet that refreshes after money or a status change also announces it', () => {
    for (const f of [
      '../components/CheckoutSheet.tsx',
      '../components/BookingSheet.tsx',
      '../components/NewVisitSheet.tsx',
      '../components/home/GiveToStaffSheet.tsx',
      '../components/home/NewTokenSheet.tsx',
      '../components/home/BookedToday.tsx',
    ]) {
      const src = code(f);
      const refreshes = (src.match(/router\.refresh\(\);/g) ?? []).length;
      const announces = (src.match(/announceVisitChanged\(\);/g) ?? []).length;
      expect({ f, refreshes, announces }).toEqual({ f, refreshes, announces: refreshes });
    }
  });

  it('Owner Home re-reads its figures and client cards, quietly', () => {
    const src = code('../components/home/OwnerHome.tsx');
    const block = src.slice(src.indexOf('useOnVisitChanged(() =>'), src.indexOf('const pickBranch'));
    expect(block).toMatch(/api\s*\.home\(period, branch\)\s*\.then\(setData\)/);
    expect(block).toMatch(/loadClientStats\(branch\)/);
    // The spinner is for a branch switch; a refresh after a payment must not blank the card.
    expect(block).not.toMatch(/setLoading/);
  });

  it('the branch carousel re-reads every branch in place', () => {
    const src = code('../components/home/BranchCarousel.tsx');
    expect(src).toMatch(/useOnVisitChanged\(\(\) => read\(\(\) => true\)\)/);
  });

  it('there is no timer behind it', () => {
    expect(code('./visit-changed.ts')).not.toMatch(/setInterval|setTimeout/);
    expect(code('../components/home/OwnerHome.tsx')).not.toMatch(/setInterval/);
  });
});
