'use client';

import { useEffect, useRef, useState } from 'react';
import { oklch } from '../tokens';

/**
 * Jira GRW-696 — a long id shown short, copied whole.
 *
 * The business page printed the full 36-character id, which nobody reads out on a support call and nobody could copy
 * on a phone without a fight. It shows the first 8 characters; a tap copies all 36 and says "Copied" for two seconds.
 * Where the clipboard is blocked (an embedded browser, an http page), the full id appears selected instead, so it can
 * be copied by hand.
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function CopyableId({ id, label = 'ID' }: { id: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state !== 'copied') return;
    const t = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (state === 'manual') input.current?.select();
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setState('copied');
    } catch {
      setState('manual');
    }
  };

  if (state === 'manual') {
    return (
      <input
        ref={input}
        readOnly
        value={id}
        aria-label={`${label}, selected — copy it`}
        onFocus={(e) => e.currentTarget.select()}
        style={{ width: '100%', minHeight: 36, fontSize: '0.8125rem', fontFamily: 'ui-monospace, monospace', padding: '0 8px', borderRadius: 8, border: `1px solid ${oklch.borderStrong}` }}
      />
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label} ${id}`}
        title={id}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 44,
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.875rem',
          fontWeight: 700,
          color: oklch.textStrong,
        }}
      >
        {shortId(id)}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: oklch.textFaint }}>
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      </button>
      <span role="status" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'oklch(0.45 0.12 150)' }}>
        {state === 'copied' ? 'Copied' : ''}
      </span>
    </span>
  );
}
