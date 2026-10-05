import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Record payment and Mark done update Home's figures without a reload.
 *
 * Every sheet ends in a server refresh (`router.refresh()`, or LiveRefresh's tick when the change was made on
 * another phone), but Owner Home holds its money and client cards for the branch and period it shows, in the
 * browser — so they kept the old numbers. Home now re-reads them when the server's overview CHANGES, which covers
 * every way a visit changes (here, a move, another device) without a hook in each sheet, and costs nothing on a
 * tick where nothing moved.
 */
const here = (p: string) => readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), p), 'utf-8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const home = code('./OwnerHome.tsx');
const carousel = code('./BranchCarousel.tsx');

describe('Home follows the server refresh', () => {
  it('re-reads only when the business-wide overview changed', () => {
    expect(home).toMatch(/const serverSig =/);
    expect(home).toMatch(/if \(serverSig === null \|\| serverSig === seenSig\.current\) return;/);
    expect(home).toMatch(/\}, \[serverSig\]\);/);
  });

  it('today on All branches is the server\'s own read, taken without a request', () => {
    const block = home.slice(home.indexOf('const seenSig'), home.indexOf('}, [serverSig]);'));
    expect(block).toMatch(/period === 'today' && branch === null/);
    expect(block).toMatch(/setData\(p\.initial\)/);
    expect(block).toMatch(/setClientStats\(p\.customerStats\)/);
  });

  it('any other branch or period is re-read quietly', () => {
    expect(home).toMatch(/load\(period, branch, true\);\s*loadClientStats\(branch\);/);
    const load = home.slice(home.indexOf('const load ='), home.indexOf('const serverSig'));
    expect(load).toMatch(/if \(!quiet\) \{\s*setLoading\(true\);/);
    // A quiet read that fails keeps the figures on screen; a successful one clears an earlier failure.
    expect(load).toMatch(/!quiet\) setFailed\(true\)/);
    expect(load).toMatch(/setData\(d\);\s*setFailed\(false\);/);
  });

  it('only the newest read lands — a slow answer cannot show another branch or period', () => {
    expect(home).toMatch(/const mine = \+\+homeSeq\.current;/);
    expect(home).toMatch(/if \(mine !== homeSeq\.current\) return;/);
    expect(home).toMatch(/const mine = \+\+statsSeq\.current;/);
  });

  it('the branch carousel re-reads in place on the same signal, and drops overtaken answers', () => {
    expect(home).toMatch(/refreshKey=\{serverSig\}/);
    expect(carousel).toMatch(/\}, \[period, ids, refreshKey\]\);/);
    expect(carousel).toMatch(/live && setFigures/);
    // Cleared only for a new period or branch list, so a refresh does not blank the slides.
    expect(carousel).toMatch(/if \(shownFor\.current !== key\) \{\s*shownFor\.current = key;\s*setFigures\(\{\}\);/);
  });

  it('adds no timer of its own', () => {
    expect(home).not.toMatch(/setInterval/);
    expect(carousel).not.toMatch(/setInterval|setTimeout/);
  });
});
