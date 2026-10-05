import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The phone's money card as a carousel, one slide per branch. */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const carousel = code('./BranchCarousel.tsx');
const home = code('./OwnerHome.tsx');
const css = read('../../styles/95-branch-carousel.css');

describe('the branch carousel on Home', () => {
  it('is one slide per branch, after an all-branches slide', () => {
    expect(carousel).toMatch(/\{ key: 'all', id: null, name: t\.allBranches/);
    expect(carousel).toMatch(/\.\.\.data\.branches\.map\(/);
  });

  it('reads each branch from the API it already has — a location, never a new endpoint', () => {
    expect(carousel).toMatch(/api\s*\.home\(period, id\)/);
  });

  it('shows the amount at once and fills the rest in as each branch answers; a failed read keeps the amount', () => {
    expect(carousel).toMatch(/\{rupees\(s\.revenueMinor\)\}/);
    expect(carousel).toMatch(/\.catch\(\(\) => undefined\)/);
    expect(carousel).toMatch(/<div className="bc-wait"/);
  });

  it('is drawn only on "All branches", for a business with more than one branch', () => {
    expect(home).toMatch(/const showCarousel = dataIsForBranch && branch === null && \(data\?\.branches\.length \?\? 0\) > 1;/);
    expect(home).toMatch(/hm-area-hero \$\{showCarousel \? 'has-carousel' : ''\}/);
  });

  it('replaces the hero on a phone only; a laptop keeps the hero', () => {
    expect(css).toMatch(/^\.bc \{\s*display: none;/m);
    expect(css).toMatch(/@media \(max-width: 860px\) \{\s*\.hm-area-hero\.has-carousel > \.hm-hero \{\s*display: none;/);
  });

  it('snaps, and moves smoothly only when the reader has not asked for reduced motion', () => {
    expect(css).toMatch(/scroll-snap-type: x mandatory;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.bc-track \{\s*scroll-behavior: smooth;/);
  });

  it('has dots that are buttons with names, and that reach a 44px tap', () => {
    expect(carousel).toMatch(/<button key=\{s\.key\} type="button"[^>]*aria-label=/);
    expect(css).toMatch(/\.bc-dots button::after \{[^}]*inset: -14px -3px;/);
  });

  it('has its words in both languages, in the dictionary and not in the markup', () => {
    expect(read('../../lib/home-copy.ts')).toMatch(/earningsByBranch: S\('Earnings by branch', '[^']+'\)/);
  });
});
