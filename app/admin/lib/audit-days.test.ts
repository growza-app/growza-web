import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '@growza-app/shared';
import { groupByDay, timeOfDay } from './audit-days';
import { actionsWithoutLabels, formatAuditAction, UNLABELLED_ACTION } from './audit-fields';

/** Jira GRW-695 — the activity log in plain words, grouped by day. */
const NOW = new Date('2026-11-10T14:30:00+05:30');
const at = (iso: string, id = iso) => ({ id, createdAt: iso });

describe('audit rows grouped by day', () => {
  it('AC-03 — Today, Yesterday, then the date, newest first, rows kept in order', () => {
    const rows = [
      at('2026-11-10T13:00:00+05:30', 'a'),
      at('2026-11-10T09:15:00+05:30', 'b'),
      at('2026-11-09T22:40:00+05:30', 'c'),
      at('2026-11-07T10:05:00+05:30', 'd'),
    ];
    const groups = groupByDay(rows, NOW);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', '7 Nov 2026']);
    expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([['a', 'b'], ['c'], ['d']]);
  });

  it('days are IST: 00:30 on the 10th is Today, though it is still the 9th in UTC', () => {
    expect(groupByDay([at('2026-11-09T19:00:00Z')], NOW)[0]!.label).toBe('Today');
  });

  it('a row under its day shows only the time', () => {
    expect(timeOfDay('2026-11-10T08:44:00Z')).toMatch(/^2:14\s?pm$/i);
  });

  it('no rows, no headings', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe('audit actions in plain words', () => {
  it('AC-02 — every action the platform can write has a label; this fails naming any that does not', () => {
    expect(actionsWithoutLabels(AUDIT_ACTIONS)).toEqual([]);
  });

  it('AC-02 — an unknown action reads "Account change", never its raw code', () => {
    expect(formatAuditAction('subscription.something_new')).toBe(UNLABELLED_ACTION);
    expect(formatAuditAction('business.suspend')).toBe('Business suspended');
  });

  it('AC-01 — neither activity list prints the raw action code any more', () => {
    for (const f of ['../components/AuditLogList.tsx', '../businesses/[id]/page.tsx']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src, f).not.toMatch(/>\s*\{row\.action\}\s*</);
      expect(src, f).toContain('groupByDay(');
    }
  });
});
