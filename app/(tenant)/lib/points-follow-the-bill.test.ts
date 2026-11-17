import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-17, finding 1 — with points on, a 90% discount on ₹520 showed "Total ₹0 — ₹52 less ₹78 in points" until
 * the points were asked again. Points now count only for the bill they were quoted for, and every till that takes
 * money with points (the till's own step, Pickup and tables, the salon's visit sheet) holds payment meanwhile.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const hook = read('use-reward-quote.ts');
const row = read('../components/RedeemRow.tsx');
const till = read('../appointments/new/PayFlow.tsx');
const pickup = read('../pos/PosClient.tsx');
const visit = read('../components/NewVisitSheet.tsx');

describe('points follow the bill they were quoted for', () => {
  it('the answer remembers its bill; a different bill spends nothing until it is answered', () => {
    expect(hook).toContain('const key = clientId && billMinor > 0 ? `${clientId}:${billMinor}` : null;');
    expect(hook).toContain('const fresh = answer !== null && answer.key === key;');
    expect(hook).toContain('const spends = usePoints && fresh && rewards !== null;');
    expect(hook).toContain('redeemPoints: spends ? rewards.maxRedeemable : 0,');
    expect(hook).toContain('redeemMinor: spends ? rewards.discountMinor : 0,');
    expect(hook).toContain('checking: usePoints && key !== null && !fresh,');
  });
  it('the points row says it is checking', () => {
    expect(row).toContain("{checking ? t('checking') : t('off', { amount: money(rewards.discountMinor) })}");
  });
  it('every till holds the payment while checking', () => {
    expect(till).toContain('if (saving || lines.length === 0 || pointsChecking) return;');
    expect(till).toContain('const redeemPoints = quotedPoints;');
    expect(pickup).toContain('const busy = saving !== null || checking;');
    expect(pickup).toContain('checking ? undefined : onSettle(');
    expect(visit).toContain('    if (pointsChecking) return;\n');
  });
});
