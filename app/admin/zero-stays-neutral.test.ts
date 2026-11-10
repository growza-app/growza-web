import { describe, expect, it } from 'vitest';
import { ATTENTION_CARDS, STAT_TINTS, attentionTint } from './dashboard-config';

/** Jira GRW-690 — colour on the admin dashboard means "look here". */
describe('an attention card is coloured only when it has something in it', () => {
  for (const card of ATTENTION_CARDS) {
    it(`${card.label}: 0 is neutral`, () => {
      expect(attentionTint(0, card.tint)).toEqual(STAT_TINTS.neutral);
    });
    it(`${card.label}: 2 keeps its warning colour`, () => {
      expect(attentionTint(2, card.tint)).toBe(card.tint);
    });
    it(`${card.label}: a figure we could not read is neutral, not red`, () => {
      expect(attentionTint(undefined, card.tint)).toEqual(STAT_TINTS.neutral);
    });
  }
  it('the neutral tint is not one of the warning tints', () => {
    expect(STAT_TINTS.neutral).not.toEqual(STAT_TINTS.amber);
    expect(STAT_TINTS.neutral).not.toEqual(STAT_TINTS.rose);
  });
});
