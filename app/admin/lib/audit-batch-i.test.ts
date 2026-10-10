import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INITIAL_PAGING, mergeRows, reloadFromFirstPage } from './paging';

/**
 * Admin portal audit, batch I (2026-10-09) — lists and paging. `reloadFromFirstPage` runs for real; the screens are
 * source-reading, as elsewhere in this suite (no DOM).
 */
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('M13 — a list reloaded after a save shows each row once', () => {
  it('reloads page 1, replacing — never the page it was on, in append mode', () => {
    const afterLoadMore = { ...INITIAL_PAGING, page: 3, intent: 'append' as const };
    const next = reloadFromFirstPage(afterLoadMore);
    expect(next).toMatchObject({ page: 1, intent: 'replace', pageSize: afterLoadMore.pageSize });
    // The rows that come back replace the buffer: no row twice.
    expect(mergeRows([1, 2, 3, 4], [9, 1, 2], next.intent)).toEqual([9, 1, 2]);
  });

  it('is a new object even on page 1, so the list refetches', () => {
    expect(reloadFromFirstPage(INITIAL_PAGING)).not.toBe(INITIAL_PAGING);
  });

  it('Businesses (after Add) and Subscriptions (after re-enrol) use it', () => {
    expect(read('businesses/page.tsx')).toMatch(/setCreated\(business\);[\s\S]*?setPaging\(reloadFromFirstPage\);/);
    const subs = read('subscriptions/page.tsx');
    expect(subs).toMatch(/onDone=\{\(\) => setPaging\(reloadFromFirstPage\)\}/);
    expect(subs).not.toMatch(/reloadToken/);
  });
});

describe('L10 — Businesses keeps its filters in the URL', () => {
  it('writes status and createdFrom back, so a cleared filter stays cleared on reload', () => {
    const page = read('businesses/page.tsx');
    expect(page).toMatch(/if \(status !== 'All'\) params\.set\('status', status\);/);
    expect(page).toMatch(/if \(activeCreatedFrom\) params\.set\('createdFrom', activeCreatedFrom\);/);
    expect(page).toMatch(/router\.replace\(next, \{ scroll: false \}\);\s*\}, \[status, activeCreatedFrom, router\]\);/);
  });
});

describe('M14 — impersonation sessions can be ended here', () => {
  const page = read('impersonation/page.tsx');
  it('offers End on the admin’s own active sessions, and calls the end route', () => {
    expect(page).toMatch(/row\.adminId && row\.adminId === me\?\.admin\.id && can\('admin\.impersonation\.start'\)/);
    expect(page).toMatch(/adminFetch\(`\/impersonation\/\$\{id\}\/end`, \{ method: 'POST' \}\)/);
  });
  it('a deactivated administrator’s session is over, not "Active now"', () => {
    expect(page).toMatch(/const isActive = \(row: SessionRow\) => row\.endedAt === null && row\.endedReason === null;/);
    expect(page).toMatch(/row\.endedReason === 'admin_deactivated'/);
  });
});
