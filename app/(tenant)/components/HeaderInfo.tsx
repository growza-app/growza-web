'use client';

import { useEffect, useRef, useState } from 'react';
import { IconInfo } from './icons';

export function HeaderInfo({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

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
        onClick={() => setOpen((o) => !o)}
      >
        <IconInfo />
      </button>
      <span className="topbar-info-pop" role="tooltip">
        {text}
      </span>
    </span>
  );
}
