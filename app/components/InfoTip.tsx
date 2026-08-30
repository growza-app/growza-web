'use client';

import { useEffect, useId, useRef, useState } from 'react';

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
export function InfoTip({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);

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
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <span className="rp-tip" ref={wrap}>
      <button
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
        <span className="rp-tip-bubble" id={id} role="tooltip">
          {children}
        </span>
      )}
    </span>
  );
}
