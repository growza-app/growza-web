/**
 * Jira GRW-317 — the arithmetic behind the hardcoded-English allowlist.
 *
 * The allowlist records WHICH literals each file may still contain, not how many.
 * A count let one string leave and a different one arrive in the same file with
 * the total unchanged, so new English passed as long as an old string went out
 * with it. Comparing the literals themselves closes that.
 */

/** File path → the literals it may still contain, duplicates kept. */
export type Inventory = Record<string, string[]>;

/** The elements of `a` that `b` does not account for, respecting duplicates. */
export function surplus(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  const out: string[] = [];
  for (const x of a) {
    const n = left.get(x) ?? 0;
    if (n > 0) left.set(x, n - 1);
    else out.push(x);
  }
  return out;
}

/**
 * The allowlist after an update: what is still there, and nothing new.
 *
 * A literal that LEFT one file may reappear, word for word, in another (a file
 * renamed, a component extracted) — it is adopted from a pool of what just went
 * away, one for one. So the total amount of allowed English can only fall.
 * A different string never gets in, which is the point: the only way to accept
 * new English is to write it in the allowlist by hand, where a reviewer sees it.
 */
export function lowered(existing: Inventory, current: Inventory): Inventory {
  const files = [...new Set([...Object.keys(existing), ...Object.keys(current)])].sort();
  const pool: string[] = [];
  const next: Inventory = {};
  const fresh: Inventory = {};

  for (const f of files) {
    const allowed = existing[f] ?? [];
    const now = current[f] ?? [];
    const gone = surplus(allowed, now);
    pool.push(...gone);
    next[f] = surplus(allowed, gone);
    fresh[f] = surplus(now, allowed);
  }

  for (const f of files) {
    for (const x of fresh[f]!) {
      const i = pool.indexOf(x);
      if (i >= 0) {
        pool.splice(i, 1);
        next[f]!.push(x);
      }
    }
  }

  return Object.fromEntries(
    files.filter((f) => next[f]!.length > 0).map((f) => [f, [...next[f]!].sort()]),
  );
}
