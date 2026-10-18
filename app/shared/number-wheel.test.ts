import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { guardNumberWheel, isFocusedNumberField } from './number-wheel';

/**
 * Owner, 2026-10-19 — scrolling over the Price field changed the amount. A focused number input takes the wheel as
 * "step the value"; the guard lets go of the field when the wheel turns, so the page scrolls and the value stays.
 */
const field = (type: string) => ({ tagName: 'INPUT', type, blur: vi.fn() });

function fakeDoc(active: unknown) {
  let handler: (() => void) | undefined;
  const doc = {
    activeElement: active,
    addEventListener: vi.fn((_: string, fn: () => void) => {
      handler = fn;
    }),
    removeEventListener: vi.fn(),
  };
  return { doc: doc as unknown as Document, wheel: () => handler?.(), spy: doc };
}

describe('a number field does not take the scroll wheel', () => {
  it('lets go of a focused number field when the wheel turns', () => {
    const input = field('number');
    const { doc, wheel } = fakeDoc(input);
    guardNumberWheel(doc);
    wheel();
    expect(input.blur).toHaveBeenCalledTimes(1);
  });

  it('leaves every other focused field alone — typing in a text box is not interrupted', () => {
    for (const type of ['text', 'tel', 'email', 'password']) {
      const input = field(type);
      const { doc, wheel } = fakeDoc(input);
      guardNumberWheel(doc);
      wheel();
      expect(input.blur).not.toHaveBeenCalled();
    }
    const { doc, wheel } = fakeDoc({ tagName: 'BUTTON', type: 'button', blur: vi.fn() });
    expect(() => {
      guardNumberWheel(doc);
      wheel();
    }).not.toThrow();
  });

  it('does nothing when nothing is focused', () => {
    const { doc, wheel } = fakeDoc(null);
    guardNumberWheel(doc);
    expect(() => wheel()).not.toThrow();
    expect(isFocusedNumberField(null)).toBe(false);
  });

  it('listens passively, so it can never make scrolling wait', () => {
    const { doc, spy } = fakeDoc(null);
    guardNumberWheel(doc);
    expect(spy.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: true });
  });

  it('removes itself', () => {
    const { doc, spy } = fakeDoc(null);
    guardNumberWheel(doc)();
    expect(spy.removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function));
  });

  it('is mounted in both root layouts, so no number field in either app is missed', () => {
    for (const f of ['../(tenant)/layout.tsx', '../admin/layout.tsx']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src, f).toContain("import { NumberWheelGuard } from '../shared/NumberWheelGuard';");
      expect(src, f).toContain('<NumberWheelGuard />');
    }
  });
});
