import { describe, expect, it } from 'vitest';
import { CLEANUP, DURATION, canStep, clamp, isDirty, slotMinutes, step, type SheetValues } from './service-sheet';

describe('holding a number inside its bounds', () => {
  it('leaves a value that is already fine', () => {
    expect(clamp(45, DURATION)).toBe(45);
  });

  it('pulls a typed value back to the edge rather than refusing it', () => {
    expect(clamp(900, DURATION)).toBe(720);
    expect(clamp(1, DURATION)).toBe(5);
    expect(clamp(-10, CLEANUP)).toBe(0);
  });

  /** A half-typed field is `Number('')` — NaN. The minimum is an answer; NaN is a crash two renders later. */
  it('a value that is not a number at all becomes the minimum, never NaN', () => {
    expect(clamp(Number.NaN, DURATION)).toBe(5);
    expect(clamp(Number.NaN, CLEANUP)).toBe(0);
  });
});

describe('one tap of − or +', () => {
  it('moves by five minutes from a round number', () => {
    expect(step(45, 1, DURATION)).toBe(50);
    expect(step(45, -1, DURATION)).toBe(40);
  });

  /*
   * From an odd number it goes to the next ROUND one, not +5 from where it was. Someone who typed 47 is
   * nudging towards 45 or 50, not towards 42 and 52.
   */
  it('from an odd number it goes to the nearest round one', () => {
    expect(step(47, 1, DURATION)).toBe(50);
    expect(step(47, -1, DURATION)).toBe(45);
  });

  it('stops at the edges instead of wrapping', () => {
    expect(step(0, -1, CLEANUP)).toBe(0);
    expect(step(240, 1, CLEANUP)).toBe(240);
    expect(step(5, -1, DURATION)).toBe(5);
    expect(step(720, 1, DURATION)).toBe(720);
  });

  it('a value typed past the edge is pulled back, not stepped past it', () => {
    expect(step(900, 1, DURATION)).toBe(720);
    expect(step(900, -1, DURATION)).toBe(715);
  });

  it('says when a button would do nothing, so it can be disabled rather than dead', () => {
    expect(canStep(0, -1, CLEANUP)).toBe(false);
    expect(canStep(0, 1, CLEANUP)).toBe(true);
    expect(canStep(720, 1, DURATION)).toBe(false);
    expect(canStep(30, -1, DURATION)).toBe(true);
  });
});

describe('the slot the calendar actually loses', () => {
  /** The sentence owners are surprised by: 45 minutes of work takes an hour off the diary. */
  it('is the service plus the cleanup held after it', () => {
    expect(slotMinutes(45, 10)).toBe(55);
    expect(slotMinutes(120, 15)).toBe(135);
  });

  it('is just the service when there is no cleanup', () => {
    expect(slotMinutes(30, 0)).toBe(30);
  });

  it('clamps both halves, so a half-typed field cannot quote nonsense', () => {
    expect(slotMinutes(Number.NaN, Number.NaN)).toBe(5);
    expect(slotMinutes(900, 900)).toBe(960);
  });
});

describe('whether Save is live', () => {
  const original: SheetValues = {
    name: 'Haircut',
    categoryId: 'c1',
    durationMin: 30,
    cleanupMin: 10,
    price: '300',
    hasNewPhoto: false,
  };
  const edited = (over: Partial<SheetValues>): SheetValues => ({ ...original, ...over });

  it('is dead until something changes', () => {
    expect(isDirty(original, original)).toBe(false);
  });

  it('wakes for each field in turn', () => {
    expect(isDirty(edited({ name: 'Haircut & Beard' }), original)).toBe(true);
    expect(isDirty(edited({ categoryId: 'c2' }), original)).toBe(true);
    expect(isDirty(edited({ durationMin: 35 }), original)).toBe(true);
    expect(isDirty(edited({ cleanupMin: 0 }), original)).toBe(true);
    expect(isDirty(edited({ price: '550' }), original)).toBe(true);
  });

  it('wakes for a photo, which has no text to compare', () => {
    expect(isDirty(edited({ hasNewPhoto: true }), original)).toBe(true);
  });

  /** Typing a space after a name is not a change the owner meant to make. */
  it('ignores whitespace the owner did not mean', () => {
    expect(isDirty(edited({ name: '  Haircut  ' }), original)).toBe(false);
    expect(isDirty(edited({ price: ' 300 ' }), original)).toBe(false);
  });

  it('a field changed and changed back is not a change', () => {
    const there = edited({ price: '550' });
    expect(isDirty(there, original)).toBe(true);
    expect(isDirty(edited({ price: '300' }), original)).toBe(false);
  });
});
