import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-14 (returns QA, loophole 2) — a manager can give money back now, and who did was stored on every return and shown nowhere.
 * The order page names them on each return; the Returns report adds who gave back how much.
 */
const order = readFileSync(new URL('../[id]/OrderClient.tsx', import.meta.url), 'utf8');
const report = readFileSync(new URL('./ReturnsClient.tsx', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../../../../messages/en.json', import.meta.url), 'utf8'));
const hi = JSON.parse(readFileSync(new URL('../../../../messages/hi.json', import.meta.url), 'utf8'));

describe('a return says who gave it back', () => {
  it('on the order: their name, else their role', () => {
    expect(order).toContain("t('detail.by', { name: r.by || t(`returns.byRole.${r.byRole}` as 'returns.byRole.owner') })");
  });
  it('on the Returns report: one card per person, the money they gave back', () => {
    expect(report).toContain("{(data.byPerson ?? []).length > 0 ? (");
    expect(report).toContain("formatMoney(p.refundMinor, 'INR', locale)");
    expect(en.orders.returns.byTitle).toBe('Given back by');
    expect(hi.orders.returns.byTitle).toBeTruthy();
    for (const role of ['owner', 'manager', 'receptionist', 'staff']) {
      expect(en.orders.returns.byRole[role]).toBeTruthy();
      expect(hi.orders.returns.byRole[role]).toBeTruthy();
    }
  });
});
