import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Owner, 2026-11-07 — no mobile number, no reward points; the till asks for the number instead of showing a balance. */
const row = readFileSync(join(__dirname, 'RedeemRow.tsx'), 'utf8');
const en = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'messages', 'en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'messages', 'hi.json'), 'utf8'));

describe('a client with no mobile number at the till', () => {
  it('is asked for the number, with what this bill would earn, before any balance is drawn', () => {
    const ask = row.indexOf('rewards.needsPhone');
    expect(ask).toBeGreaterThan(-1);
    expect(ask, 'before the "nothing to show" early return').toBeLessThan(row.indexOf('rewards.maxRedeemable === 0 && rewards.balance === 0'));
    expect(row).toMatch(/t\('addNumberToEarn', \{ points: rewards\.wouldEarn! \}\)/);
    expect(row).toMatch(/t\('addNumber'\)/);
  });

  it('says it in English and Hindi, with the same placeholders', () => {
    expect(en.payFlow.rewards.addNumberToEarn).toContain('{points, plural,');
    expect(hi.payFlow.rewards.addNumberToEarn).toContain('{points, plural,');
    expect(en.payFlow.rewards.addNumber).toMatch(/mobile number/);
    expect(hi.payFlow.rewards.addNumber).toMatch(/[ऀ-ॿ]/);
  });
});
