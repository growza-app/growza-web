import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_MESSAGES_HI, localiseApiMessage } from '../lib/api-messages';

/**
 * Review of the overnight stack (Jira GRW-736 fixes).
 *
 * Item 1 — a bill with GST added on top: the order's total carries the GST line, so Pickup's free-bill rule and its
 * "whole order off" were asked of the food AND the tax. The server measures both on the food (the quote's `billMinor`).
 * Item 5 · L2 — a coupon counted per guest needs the guest's phone number: the till sends a typed number with its quote,
 * so a new guest's coupon is quoted, and a guest with none is told why (EN + HI).
 */
const pos = readFileSync(resolve(__dirname, 'PosClient.tsx'), 'utf8');
const pay = pos.slice(pos.indexOf('function QueueTokenPayScreen'), pos.indexOf('export function PosClient'));
const till = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
const hook = readFileSync(resolve(__dirname, '../lib/use-bill-offers.ts'), 'utf8');

describe('item 1 — the payment screen measures a coupon on the food, never on the GST on top', () => {
  it('the free-bill rule, "whole order off" and the discount sheet read the food total the quote gives', () => {
    expect(hook).toMatch(/billMinor: fresh\?\.billMinor \?\? null/);
    expect(pay).toMatch(/const foodMinor = offers\.billMinor \?\? token\.totalMinor;/);
    expect(pay).toMatch(/freeBillBlock\(foodMinor, foodMinor - offMinor, isOwner, freeReason\)/);
    expect(pay).toMatch(/const wholeOrderOff = foodMinor > 0 && offMinor >= foodMinor;/);
    expect(pay).toMatch(/listMinor=\{foodMinor\}/);
    expect(pay).not.toMatch(/freeBillBlock\(token\.totalMinor/);
    expect(pay).not.toMatch(/offMinor >= token\.totalMinor/);
  });
});

describe('item 5 · L2 — a per-guest coupon and the guest’s phone number', () => {
  it('the till quotes with a new guest’s typed number', () => {
    expect(till).toMatch(/client\.kind === 'named' && client\.phone \? \{ customerPhone: client\.phone \} : \{\}/);
    expect(hook).toMatch(/customerPhone\?: string;/);
  });

  it('the reasons the server now gives are said in Hindi too', () => {
    for (const en of [
      'This code is counted per guest. Add the guest’s phone number to use it.',
      'A payment is already recorded on this bill, so a coupon cannot be added to it.',
      'Only the owner can make a coupon that takes the whole bill off.',
    ]) {
      expect(API_MESSAGES_HI[en], en).toBeTruthy();
      expect(localiseApiMessage(en, 'hi')).not.toBe(en);
    }
    expect(localiseApiMessage('2 tables have guests seated. Free them before switching Table orders off.', 'hi')).toMatch(/^2 टेबल/);
    expect(localiseApiMessage('Ask the manager to move this table to Garden, its prices are different.', 'hi')).toContain('Garden');
  });
});
