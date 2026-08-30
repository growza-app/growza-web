'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * The "what does this number actually count?" button.
 *
 * Every figure on Reports is the result of a rule — which statuses count, which
 * money field is trusted, whether it describes the period or today — and none
 * of those rules were anywhere the owner could read them. Two of the defects
 * fixed in this epic were the same word meaning two things on two screens;
 * this is the same problem seen from the owner's side, where the recourse was
 * to guess.
 *
 * A button, not a `title` attribute: `title` never appears on a phone, and the
 * phone is where this product is read.
 */

/** Never narrower than this, however narrow the thing it explains. */
const MIN_WIDTH = 210;
const MAX_WIDTH = 300;
/** Clearance from the viewport edges, and between the icon and the bubble. */
const EDGE = 8;
const GAP = 6;

export function InfoTip({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);

  /**
   * Positioned against the icon, in viewport coordinates.
   *
   * Anchoring it to an ancestor box was tried first and is what a stylesheet
   * can express, but no ancestor is both close to the icon and wide enough to
   * read in. Anchored to the tile, the bubble opened over the tile's own
   * figure and covered the row beneath; anchored to the grid so it would be
   * wide enough on a phone, tapping the top-left tile put the explanation
   * 139px away underneath the *bottom* row, where it read as belonging to a
   * different number.
   *
   * So it is measured: directly under its own icon, clamped to stay on
   * screen, and flipped above when there is no room below.
   */
  const position = useCallback(() => {
    const anchor = btn.current?.getBoundingClientRect();
    if (!anchor) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, vw - EDGE * 2));
    const centred = anchor.left + anchor.width / 2 - width / 2;
    const left = Math.max(EDGE, Math.min(centred, vw - width - EDGE));

    // Measured once rendered; on the first pass we do not know it yet, so the
    // bubble opens below and corrects itself in the same frame if it does not
    // fit. That is one layout pass, not a visible jump.
    const height = bubble.current?.getBoundingClientRect().height ?? 0;
    const below = anchor.bottom + GAP;
    const flip = height > 0 && below + height > vh - EDGE && anchor.top - GAP - height > EDGE;

    setPlace({ top: flip ? anchor.top - GAP - height : below, left, width });
  }, []);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Anywhere else closes it, including another tip's button — two open
    // bubbles overlapping each other would be worse than none.
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    // Fixed coordinates go stale the moment anything moves, so they are
    // recomputed rather than left pointing at where the icon used to be.
    const onMove = () => position();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, position]);

  return (
    <span className="rp-tip" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="rp-tip-btn"
        aria-label={`What does ${label} count?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          // The tile itself may be clickable; asking what a figure means is
          // not a request to go wherever the tile goes.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        i
      </button>
      {open && (
        <span
          ref={bubble}
          className="rp-tip-bubble"
          id={id}
          role="tooltip"
          style={
            place
              ? { top: place.top, left: place.left, width: place.width }
              : // Off-screen for the frame before it is measured, rather than
                // flashing at 0,0 first.
                { top: -9999, left: -9999, width: MAX_WIDTH }
          }
        >
          {children}
        </span>
      )}
    </span>
  );
}
