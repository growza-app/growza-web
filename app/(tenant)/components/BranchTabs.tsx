'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

/**
 * Jira GRW-340 — one tab per branch, on a phone: "All", then each open branch.
 *
 * Shown by CSS at phone widths only (88-branch-tabs.css); a laptop keeps its dropdown. It only ever renders for an
 * owner with two or more branches — the caller passes `branches` empty otherwise, and nothing is drawn.
 *
 * A row of tabs rather than a dropdown because the branch is the question every figure below it depends on, and it
 * should be one tap and always visible. With more names than the width holds the row scrolls inside itself and
 * keeps the chosen tab in view; the page never scrolls sideways.
 */
export function BranchTabs({
  branches,
  value,
  onChange,
  allLabel,
  label,
  className = '',
}: {
  branches: ReadonlyArray<{ id: string; name: string }>;
  /** The chosen branch id; null is every branch. */
  value: string | null;
  onChange: (id: string | null) => void;
  allLabel: string;
  /** What the group is called to a screen reader: "Branch". */
  label: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the chosen tab in view — by scrolling the row itself. `scrollIntoView` would also scroll the page.
  useEffect(() => {
    const list = listRef.current;
    const on = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !on) return;
    list.scrollTo({ left: on.offsetLeft - (list.clientWidth - on.offsetWidth) / 2 });
  }, [value, branches.length]);

  if (branches.length < 2) return null;

  const tabs: Array<{ id: string | null; name: string }> = [{ id: null, name: allLabel }, ...branches];

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((t) => t.id === value);
    const to =
      e.key === 'ArrowRight' ? (at + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (at - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to]!.id);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
  };

  return (
    <div ref={listRef} className={`branch-tabs ${className}`} role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id ?? 'all'}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={on ? 'is-on' : ''}
            onClick={() => onChange(t.id)}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
