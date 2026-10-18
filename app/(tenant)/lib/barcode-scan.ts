import { useEffect, useRef } from 'react';

/**
 * Owner, 2026-10-19 — "after scanning, the product should be added automatically".
 *
 * A scanner is a keyboard that types a whole code in a few milliseconds and, as a rule, presses Enter. Until now the
 * code only landed if the search box happened to be focused; tap anywhere else and the scan went nowhere. This reads
 * the burst from the page itself, so a scan counts wherever the cursor is — and never mistakes a person typing, who
 * is far too slow to look like one.
 */
export const SCAN_MAX_GAP_MS = 80;
export const SCAN_MIN_LENGTH = 4;
/** A scanner set to send no Enter is taken to be done when it stops typing for this long. */
export const SCAN_IDLE_MS = 150;

export type ScanReader = {
  /** A key went down. Returns the code when this key completes a scan (Enter), else null. */
  key: (key: string, at: number) => string | null;
  /** The reader fell quiet for SCAN_IDLE_MS. Returns the code if a scan with no Enter is waiting, else null. */
  idle: () => string | null;
  reset: () => void;
};

export function createScanReader(): ScanReader {
  let buf = '';
  let last = 0;
  const done = (): string | null => {
    const code = buf;
    buf = '';
    return code.length >= SCAN_MIN_LENGTH ? code : null;
  };
  return {
    key(key, at) {
      if (buf && at - last > SCAN_MAX_GAP_MS) buf = '';
      last = at;
      if (key === 'Enter') return done();
      // A single printable character; Shift, Tab, arrows and the like are named keys and are not part of a code.
      if (key.length === 1) buf += key;
      return null;
    },
    idle() {
      return buf ? done() : null;
    },
    reset() {
      buf = '';
    },
  };
}

/** True where a person is typing, so a scan there is theirs to receive (the search box has its own Enter handler). */
export function isTypingTarget(el: unknown): boolean {
  if (typeof el !== 'object' || el === null) return false;
  const e = el as HTMLElement;
  if (e.isContentEditable) return true;
  const tag = e.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (e as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(type);
}

/**
 * Calls `onCode` for every scan while `enabled`. Skipped while a dialog is open (the sheet it opened has its own
 * scan handling) and while a field is focused. Returns true from `onCode` when the code was a product, so the Enter
 * is swallowed — otherwise it would also press whichever button the last tap left focused.
 */
export function useBarcodeScan(enabled: boolean, onCode: (code: string) => boolean) {
  const handler = useRef(onCode);
  handler.current = onCode;
  useEffect(() => {
    if (!enabled) return;
    const reader = createScanReader();
    let timer: number | undefined;
    const fire = (code: string | null, event?: KeyboardEvent) => {
      if (code && handler.current(code) && event) event.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      window.clearTimeout(timer);
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return reader.reset();
      if (isTypingTarget(document.activeElement) || document.querySelector('[role="dialog"][aria-modal="true"]')) return reader.reset();
      const code = reader.key(e.key, e.timeStamp);
      if (code) return fire(code, e);
      timer = window.setTimeout(() => fire(reader.idle()), SCAN_IDLE_MS);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.clearTimeout(timer);
    };
  }, [enabled]);
}
