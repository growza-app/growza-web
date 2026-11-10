import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupByDay } from './order-days';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/** Owner, 10 Nov 2026 — the phone's Orders list, redone: one rounded list per day, two lines an order, the token shown. */
const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const client = src('OrdersClient.tsx');
const screen = src('OrdersScreen.tsx');
const css = src('../styles/99-orders.css');
// 10 Nov 2026, 10:30 IST.
const NOW = Date.parse('2026-11-10T05:00:00.000Z');

describe('grouping by day', () => {
  it('uses the branch’s own day: 1:16 am IST on the 10th is today, not the 9th', () => {
    const rows = [
      { id: 'a', soldAt: '2026-11-09T19:46:04.317Z' }, // 10 Nov 01:16 IST
      { id: 'b', soldAt: '2026-11-09T16:45:00.000Z' }, // 9 Nov 22:15 IST
      { id: 'c', soldAt: '2026-11-09T04:00:00.000Z' }, // 9 Nov 09:30 IST
      { id: 'd', soldAt: '2026-11-07T10:00:00.000Z' }, // 7 Nov
    ];
    const days = groupByDay(rows, 'Asia/Kolkata', NOW);
    expect(days.map((d) => [d.key, d.kind, d.rows.map((r) => r.id)])).toEqual([
      ['2026-11-10', 'today', ['a']],
      ['2026-11-09', 'yesterday', ['b', 'c']],
      ['2026-11-07', 'other', ['d']],
    ]);
  });

  it('keeps the server’s order and never re-sorts', () => {
    const rows = [
      { id: 'late', soldAt: '2026-11-08T12:00:00.000Z' },
      { id: 'early', soldAt: '2026-11-08T06:00:00.000Z' },
    ];
    expect(groupByDay(rows, 'Asia/Kolkata', NOW)[0]!.rows.map((r) => r.id)).toEqual(['late', 'early']);
  });

  it('an empty page is no days', () => {
    expect(groupByDay([], 'Asia/Kolkata', NOW)).toEqual([]);
  });
});

describe('the phone list', () => {
  it('shows the token where there is one, and the code only where there is not', () => {
    expect(client).toContain('{r.tokenNo ? <span className="ord-token">{formatTokenNo(r.tokenNo)}</span> : null}');
    expect(client).toContain("{r.tokenNo ? null : <span className=\"ord-code\">{t('list.orderCode', { code: r.code.toUpperCase() })}</span>}");
  });

  it('greys a cancelled or returned order and crosses its amount through', () => {
    expect(client).toContain("r.status === 'cancelled' || r.status === 'returned'");
    expect(css).toMatch(/\.ord-card\.is-void \.ord-amount \{[^}]*text-decoration: line-through;/);
  });

  it('puts the payout under the search and filters, not above them', () => {
    expect(screen).toContain('payout={showPayout ? <PayoutCard');
    expect(client.indexOf('{payout}')).toBeGreaterThan(client.indexOf('ord-chips-channel'));
  });

  it('draws no box round the filters on a phone; a laptop keeps its card', () => {
    expect(css).toMatch(/^\.ord-tools \{\n  display: flex;\n  flex-direction: column;\n  gap: var\(--sp-2\);\n\}/m);
    expect(css).toMatch(/@media \(min-width: 861px\)[\s\S]*\.ord-tools \{\n    padding: var\(--sp-3\) var\(--sp-4\);\n    background: var\(--surface\);/);
  });

  it('says Today, Yesterday and No items in both languages', () => {
    for (const lang of [en, hi]) {
      expect(lang.orders.list.today).toBeTruthy();
      expect(lang.orders.list.yesterday).toBeTruthy();
      expect(lang.orders.list.itemCount).toContain('=0 {');
    }
  });
});
