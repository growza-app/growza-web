import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 13 Nov 2026, bug 10 — a restaurant's front desk rang up Token 01 and its till's Queue said 0: the queue asked for the Sales
 * register, which the desk is refused. It now asks for the queue's own read (`includeSales=queue`), which the API answers for the
 * desk without amounts. The till's Return keeps the register's read: only a role that may take returns opens it.
 */
const pos = readFileSync(new URL('./PosClient.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8');

describe('the till’s queue is read the way the desk may read it', () => {
  it('asks for the queue, not the register', () => {
    const load = pos.slice(pos.indexOf('const loadTodayTokens = useCallback'), pos.indexOf('}, [todayISO]);'));
    expect(load).toContain("includeSales: 'queue',");
    expect(api).toContain("params.set('includeSales', opts.includeSales === 'queue' ? 'queue' : '1');");
  });
  it('the Return sheet still reads the register', () => {
    const ret = pos.slice(pos.indexOf('const openReturn = useCallback'));
    expect(ret.slice(0, 900)).toContain('includeSales: true,');
  });
});
