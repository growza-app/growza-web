import { describe, expect, it } from 'vitest';
import { createScanReader, isTypingTarget, SCAN_MAX_GAP_MS } from './barcode-scan';

const type = (r: ReturnType<typeof createScanReader>, text: string, start: number, gap: number) => {
  let at = start;
  let out: string | null = null;
  for (const ch of text) {
    out = r.key(ch, at);
    at += gap;
  }
  return { out, at };
};

describe('scan reader', () => {
  it('returns the code when a fast burst ends in Enter', () => {
    const r = createScanReader();
    const { out, at } = type(r, '8901234567890', 1000, 10);
    expect(out).toBeNull();
    expect(r.key('Enter', at)).toBe('8901234567890');
  });

  it('reads two scans in a row as two codes', () => {
    const r = createScanReader();
    const a = type(r, 'ABC1234', 0, 5);
    expect(r.key('Enter', a.at)).toBe('ABC1234');
    const b = type(r, 'XYZ9999', a.at + 500, 5);
    expect(r.key('Enter', b.at)).toBe('XYZ9999');
  });

  it('ignores a person typing, however long', () => {
    const r = createScanReader();
    const { at } = type(r, 'shampoo', 0, SCAN_MAX_GAP_MS + 40);
    expect(r.key('Enter', at)).toBeNull();
  });

  it('ignores a burst too short to be a barcode', () => {
    const r = createScanReader();
    const { at } = type(r, '12', 0, 5);
    expect(r.key('Enter', at)).toBeNull();
  });

  it('drops a stale half-typed start when the scan begins', () => {
    const r = createScanReader();
    r.key('x', 0);
    const { at } = type(r, '8901234', 5000, 5);
    expect(r.key('Enter', at)).toBe('8901234');
  });

  it('does not count Shift, Tab or arrows as part of a code', () => {
    const r = createScanReader();
    r.key('Shift', 0);
    const { at } = type(r, 'AB12', 5, 5);
    r.key('Tab', at);
    expect(r.key('Enter', at + 5)).toBe('AB12');
  });

  it('hands over a scan from a scanner that sends no Enter once it goes quiet', () => {
    const r = createScanReader();
    type(r, '8901234567890', 0, 8);
    expect(r.idle()).toBe('8901234567890');
    expect(r.idle()).toBeNull();
  });

  it('forgets what was typed on reset', () => {
    const r = createScanReader();
    type(r, '8901234', 0, 5);
    r.reset();
    expect(r.key('Enter', 100)).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('is true for text fields and false for buttons and checkboxes', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
