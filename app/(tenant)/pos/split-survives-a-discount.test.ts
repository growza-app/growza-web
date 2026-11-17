import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * QA 2026-11-17, finding 2 — ₹780, "₹200 by Cash" held, then 50% off: the ₹200 vanished without a word and the bill was
 * saved as ₹390 all UPI. The first part is money in hand: a discount or the points no longer wipe it, and a first part
 * not less than the new total is said, never dropped.
 */
const pos = readFileSync(resolve(__dirname, 'PosClient.tsx'), 'utf8');
const till = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
const pay = pos.slice(pos.indexOf('function QueueTokenPayScreen'), pos.indexOf('export function PosClient'));

describe('the first part of a two-way payment survives a discount', () => {
  it('Pickup/tables: neither the discount nor the points clear it', () => {
    expect(pay).not.toMatch(/onApply=\{\(offMinor, pct\) => \{\s*clearSplit\(\);/);
    expect(pay).not.toMatch(/onRemove=\{\(\) => \{\s*clearSplit\(\);/);
    expect(pay).toContain('const handleToggleRedeem = () => toggleRedeem();');
  });
  it('both screens say when the first part is no longer less than the total, and take no money until it is fixed', () => {
    for (const src of [pay, till]) {
      expect(src).toContain('const splitTooBig = firstWay !== null && firstWay.minor >= dueMinor;');
      expect(src).toMatch(/splitTooBig \? 'split\.tooBig' : 'split\.then'/);
    }
    expect(pay).toContain('if (freeBlock || checking || splitTooBig) return;');
    expect(till).toContain('if (saving || lines.length === 0 || freeBlock || pointsChecking || splitTooBig) return;');
  });
  it('in English and Hindi', () => {
    expect(en.payFlow.split.tooBig).toContain('{amount} by {mode}');
    expect(hi.payFlow.split.tooBig).toContain('{amount}');
  });
});
