'use client';

import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';

/**
 * Owner, 2026-10-28 — closing an overlay by tapping beside it must not also press what is underneath.
 *
 * Their words: "when he tries to close the overlay by clicking outside of the overlay card, accidently the menu
 * item may add up or gets deleted". That is exactly what happened, and it was the same line copied into eleven
 * files:
 *
 *     <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
 *
 * `pointerdown` fires the instant the finger lands. The scrim unmounted underneath it, so the `pointerup` and the
 * compatibility `click` that follow were delivered to whatever was now under the finger — a dish tile, which adds
 * one to the bill, or a row's "−", which takes one off. On the till that is money: a bill gains an item nobody
 * ordered, or loses one somebody did, and the desk has no idea it happened.
 *
 * The fix is the pair of events, not one of them:
 *
 *  - `pointerdown` only REMEMBERS that the press began on the scrim. It closes nothing.
 *  - `click` closes, and because the scrim is still mounted when it arrives, the click's target is the scrim. The
 *    element underneath never sees it. This is the whole of the passthrough fix.
 *  - requiring the press to have begun on the scrim handles the other direction: a drag that starts inside the
 *    card and releases outside it (scrolling a long list with a sloppy thumb) would otherwise dismiss the sheet,
 *    because `click` is dispatched to the common ancestor of the two, which is the scrim.
 *
 * `enabled: false` is for a sheet that must not be dismissed at all right now — two of the eleven refuse while a
 * request is in flight (`!busy`), so that it cannot be closed out from under its own answer.
 */
export function useScrimDismiss(onClose: () => void, enabled = true) {
  /** The pointer that began on the scrim itself, if any. Null between presses, and after one that began inside. */
  const openedOn = useRef<number | null>(null);

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      openedOn.current = e.target === e.currentTarget ? e.pointerId : null;
    },
    onPointerCancel: () => {
      openedOn.current = null;
    },
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      const began = openedOn.current;
      openedOn.current = null;
      if (!enabled) return;
      // Both halves: the press began out here, and the release is out here too.
      if (began !== null && e.target === e.currentTarget) onClose();
    },
  };
}
