import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { movesFrom } from '@growza-app/shared';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';

/**
 * QA of develop, 2026-10-23 — "Cancel this order" fired on one tap from the More menu.
 *
 * Cancelled and came back are final: nothing moves an order out of them, so a slip of the thumb could not be put right.
 * Those two are asked about first; every other move still goes on one tap.
 */
const src = readFileSync(resolve(__dirname, 'OrderClient.tsx'), 'utf8');

describe('a move that cannot be taken back', () => {
  it('is final in the shared state machine — the reason it is asked about', () => {
    expect(movesFrom('cancelled')).toEqual([]);
    expect(movesFrom('returned')).toEqual([]);
  });

  it('goes through the confirm, from the More menu and from the main button alike', () => {
    expect(src).toContain("if (to === 'cancelled' || to === 'returned')");
    expect(src).not.toContain('onClick={() => void move(');
    expect(src).toContain('<ConfirmDialog');
  });

  it('is worded in English and Hindi', () => {
    for (const lang of [en, hi]) {
      for (const k of ['cancelled', 'returned'] as const) {
        const w = lang.orders.detail.confirmMove[k];
        expect(w.title && w.body && w.confirm && w.keep).toBeTruthy();
      }
    }
  });
});
