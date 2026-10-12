import { problem, type Draft, type DraftProblem } from './import-drafts';

/**
 * The review step is review by exception: a long list is mostly fine, so what it has to do well is find the
 * rows that are not. Pure, because the counts and the grouping are what the owner trusts — "3 need fixing" has
 * to be exactly the rows that block the import.
 */
export type ReviewFilter = 'all' | 'fix' | 'existing' | 'skipped';

export interface ReviewRow {
  /** Index into the drafts — the stable key, since a draft has no id and the list is regrouped. */
  index: number;
  draft: Draft;
  /** Why it cannot be saved yet. Never set on a skipped row: that one is not going to be saved. */
  issue: DraftProblem | null;
}

export function reviewRows(drafts: readonly Draft[]): ReviewRow[] {
  return drafts.map((draft, index) => ({ index, draft, issue: draft.skip ? null : problem(draft) }));
}

export function reviewCounts(rows: readonly ReviewRow[]): Record<ReviewFilter, number> {
  return {
    all: rows.length,
    fix: rows.filter((r) => r.issue !== null).length,
    existing: rows.filter((r) => !r.draft.skip && r.draft.existing).length,
    skipped: rows.filter((r) => r.draft.skip).length,
  };
}

export function matchesFilter(r: ReviewRow, filter: ReviewFilter): boolean {
  if (filter === 'fix') return r.issue !== null;
  if (filter === 'existing') return !r.draft.skip && !!r.draft.existing;
  if (filter === 'skipped') return r.draft.skip;
  return true;
}

/** Rows grouped by the category the owner mapped, in the order the file first names them. '' is "no category". */
export function reviewGroups(rows: readonly ReviewRow[]): Array<{ name: string; rows: ReviewRow[] }> {
  const order: string[] = [];
  const byName = new Map<string, ReviewRow[]>();
  for (const r of rows) {
    const name = r.draft.categoryName.trim();
    if (!byName.has(name)) {
      byName.set(name, []);
      order.push(name);
    }
    byName.get(name)!.push(r);
  }
  return order.map((name) => ({ name, rows: byName.get(name)! }));
}

/** The first row that blocks the import, or -1. */
export function firstProblem(rows: readonly ReviewRow[]): number {
  return rows.find((r) => r.issue !== null)?.index ?? -1;
}
