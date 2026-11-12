import { describe, expect, it } from 'vitest';
import { attentionLine } from './NeedsAttention';

/** QA loophole L5, 11 Nov 2026 — "Record payment" only for an admin who may record one. */
const meera = { tenantId: 't1', name: 'Meera Beauty Lounge', kind: 'overdue' as const, since: '2026-11-06T00:00:00Z', stage: 'PAST_DUE' as const };

describe('the overdue row’s button', () => {
  it('says Record payment to an admin who may record one', () => {
    expect(attentionLine(meera, new Date('2026-11-11T06:00:00Z'), true).action).toBe('Record payment');
  });

  it('says Open subscription to anyone else, and goes to the same place', () => {
    const line = attentionLine(meera, new Date('2026-11-11T06:00:00Z'), false);
    expect(line.action).toBe('Open subscription');
    expect(line.href).toBe('/admin/businesses/t1?tab=subscription');
  });
});
