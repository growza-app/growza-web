'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { IconInfo } from './icons';

export function HeaderInfo({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  /*
   * Owner, 2026-11-20 — on a phone the ⓘ sits in a narrow title row, and the popover was boxed into it (a column one
   * word wide). Opened on a phone it is placed from the button instead: the screen's width less the page margins,
   * just under the ⓘ. A laptop keeps the CSS placement beside the title.
   */
  const [phonePos, setPhonePos] = useState<CSSProperties | undefined>(undefined);
  const place = () => {
    const btn = wrapRef.current?.getBoundingClientRect();
    if (!btn || window.innerWidth > 860) return setPhonePos(undefined);
    setPhonePos({ position: 'fixed', top: Math.round(btn.bottom + 8), left: 16, right: 16, width: 'auto' });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className={`topbar-info ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="topbar-info-btn"
        aria-label={label}
        aria-expanded={open}
        title={text}
        onClick={() => {
          if (!open) place();
          setOpen((o) => !o);
        }}
      >
        <IconInfo />
      </button>
      <span className="topbar-info-pop" role="tooltip" style={open ? phonePos : undefined}>
        {text}
      </span>
    </span>
  );
}
