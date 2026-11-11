import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAT_TINTS, needsAttentionTile } from '../dashboard-config';

/** Owner, 11 Nov 2026 — Needs attention is a tile on the dashboard, and the list its own page. */
const dashboard = readFileSync(join(__dirname, '../page.tsx'), 'utf8');
const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '../admin.css'), 'utf8');
const counts = (o: Partial<Record<'overdue' | 'payment_failed' | 'setup_stuck' | 'trial_ending', number>>) => {
  const c = { overdue: 0, payment_failed: 0, setup_stuck: 0, trial_ending: 0, ...o };
  return { total: Object.values(c).reduce((a, b) => a + b, 0), counts: c };
};

describe('the tile', () => {
  it('opens the page, and the dashboard no longer lists the rows itself', () => {
    expect(dashboard).toContain('href="/admin/needs-attention"');
    expect(dashboard).not.toMatch(/<NeedsAttention rows=/);
  });

  it('names up to two reasons, then "N more"; red while anything is overdue', () => {
    expect(needsAttentionTile(counts({ overdue: 1, setup_stuck: 2 }))).toEqual({ note: '1 overdue · 2 setup stuck', tint: STAT_TINTS.rose });
    expect(needsAttentionTile(counts({ overdue: 1, setup_stuck: 1, trial_ending: 1 })).note).toBe('1 overdue · 2 more');
    expect(needsAttentionTile(counts({ trial_ending: 3 }))).toEqual({ note: '3 trial ending', tint: STAT_TINTS.amber });
  });

  it('nothing to do is grey and says so', () => {
    expect(needsAttentionTile(counts({}))).toEqual({ note: 'No business needs you', tint: STAT_TINTS.neutral });
  });

  it('five tiles never squeeze: five across only from 1366px, three over two below it', () => {
    expect(css).toContain('@media (min-width: 1366px)');
    expect(css).toContain('.admin-stat-grid:has(> :nth-child(5):last-child)');
    expect(css).toContain('.admin-stat-grid > :last-child:nth-child(odd)');
  });
});

describe('the page', () => {
  it('pages through the API with the reason kept in the URL', () => {
    expect(page).toContain('/needs-attention?${q.toString()}');
    expect(page).toContain("router.replace(next === 'all' ? '/admin/needs-attention' : `/admin/needs-attention?kind=${next}`)");
    expect(page).toContain('<Pagination total={data.total}');
  });

  it('a reason with nobody in it has no chip, unless it is the one chosen', () => {
    expect(page).toContain('data.counts[k] > 0 || k === filter');
  });

  it('has loading, error with Retry, and an empty line that names what is clear', () => {
    expect(page).toContain('aria-busy="true"');
    expect(page).toContain('Retry');
    expect(page).toContain("overdue: 'No business is behind on its bill.'");
  });
});
