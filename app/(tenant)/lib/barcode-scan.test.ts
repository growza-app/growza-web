import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScanListener, createScanReader, isTypingTarget, SCAN_IDLE_MS, SCAN_MAX_GAP_MS, type ScanKey } from './barcode-scan';

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

describe('scan listener', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (blocked = false) => {
    const codes: string[] = [];
    const state = { blocked };
    const listener = createScanListener({ blocked: () => state.blocked, onCode: (c) => codes.push(c) });
    let at = 0;
    const prevented: boolean[] = [];
    const press = (key: string, extra: Partial<ScanKey> = {}) => {
      let stopped = false;
      listener.onKey({ key, timeStamp: (at += 5), isComposing: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, preventDefault: () => (stopped = true), ...extra });
      if (key === 'Enter') prevented.push(stopped);
    };
    const scan = (code: string) => {
      for (const ch of code) press(ch);
      press('Enter');
    };
    return { codes, state, press, scan, prevented };
  };

  it('delivers a scan and swallows its Enter', () => {
    const { codes, scan, prevented } = setup();
    scan('8901234567890');
    expect(codes).toEqual(['8901234567890']);
    expect(prevented).toEqual([true]);
  });

  it('swallows the Enter of a scan whatever the handler does with the code', () => {
    // A code that matches nothing is still a scan: its Enter must not press the button the last tap left focused.
    const { codes, scan, prevented } = setup();
    scan('0000111122');
    expect(codes).toEqual(['0000111122']);
    expect(prevented).toEqual([true]);
  });

  it('leaves a plain Enter alone', () => {
    const { codes, press, prevented } = setup();
    press('Enter');
    expect(codes).toEqual([]);
    expect(prevented).toEqual([false]);
  });

  it('ignores everything while a field has focus or a dialog is open', () => {
    const { codes, state, scan } = setup(true);
    scan('8901234567890');
    state.blocked = false;
    scan('ABC1234');
    expect(codes).toEqual(['ABC1234']);
  });

  it('forgets a half-read code when the page becomes blocked mid-way', () => {
    const { codes, state, press } = setup();
    for (const ch of '89012') press(ch);
    state.blocked = true;
    press('3');
    state.blocked = false;
    press('Enter');
    expect(codes).toEqual([]);
  });

  it('ignores shortcuts, auto-repeat and IME composition', () => {
    const { codes, press } = setup();
    for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }]) {
      for (const ch of 'ABCDEF') press(ch, extra);
      press('Enter', extra);
    }
    expect(codes).toEqual([]);
  });

  it('delivers a scan that sends no Enter after it goes quiet, once', () => {
    const { codes, press } = setup();
    for (const ch of '8901234567890') press(ch);
    expect(codes).toEqual([]);
    vi.advanceTimersByTime(SCAN_IDLE_MS + 1);
    expect(codes).toEqual(['8901234567890']);
    vi.advanceTimersByTime(1000);
    expect(codes).toEqual(['8901234567890']);
  });

  it('does not deliver the quiet-scan code after dispose', () => {
    const codes: string[] = [];
    const l = createScanListener({ blocked: () => false, onCode: (c) => codes.push(c) });
    for (const ch of 'ABC1234') l.onKey({ key: ch, timeStamp: 1, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, preventDefault: () => {} });
    l.dispose();
    vi.advanceTimersByTime(1000);
    expect(codes).toEqual([]);
  });
});

describe('the till wires the scan in', () => {
  const src = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');

  it('listens only on the screen where products are picked', () => {
    expect(src).toMatch(/useBarcodeScan\(productsOnly && step === 'what'/);
  });

  it('says why a scan added nothing, instead of buzzing alone', () => {
    expect(src).toContain("t('desk.scanMiss'");
    expect(src).toContain("t('desk.scanNoStock'");
    expect(src).toContain("t('desk.scanFull')");
  });

  it('calls the hook above the early returns', () => {
    expect(src.indexOf('useBarcodeScan(')).toBeLessThan(src.indexOf("  if (step === 'done' && sale) {"));
  });
});
