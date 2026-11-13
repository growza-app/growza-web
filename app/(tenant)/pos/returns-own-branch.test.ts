import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Owner, 2026-11-14 (returns QA, loophole 1) — a manager with a home branch takes returns at that branch only. */
const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const pos = readFileSync(new URL('./PosClient.tsx', import.meta.url), 'utf8');

describe('the till offers a manager only their own branch’s bills to take back', () => {
  it('passes the home branch, never for the owner', () => {
    expect(page).toContain('returnBranch={me.member?.returnBranchId ?? null}');
  });
  it('filters the Return list by it', () => {
    expect(pos).toContain("(!returnBranch || r.locationId === returnBranch)");
    expect(pos).toContain('}, [todayISO, returnWindowDays, timezone, returnBranch]);');
  });
});
