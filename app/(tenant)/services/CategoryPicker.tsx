'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '../components/icons';
import { ALL_TAB, RETIRED_TAB, type ServiceTab } from './services-tabs';

/**
 * Jira GRW-587 — which part of the menu the Services screen is showing, as one control.
 *
 * This replaces the row of tabs. The tabs were fine for the five categories a seeded salon opens with and
 * impossible for a real price list: a salon that typed in its printed menu had 23 of them, and the strip
 * measured 2584px inside a 343px screen — 87% of it off the side, with Waxing about twenty swipes away. The
 * seeded five already overflowed at 375px, so there is no count at which the strip is right and no threshold
 * worth keeping two layouts for.
 *
 * A disclosure, not an ARIA menu, and deliberately the same one the branch picker uses (GRW-395): a menu
 * promises arrow keys and type-ahead, this is a list of buttons Tab walks through. The rest of its behaviour is
 * that picker's too, for the same reasons it was argued there — closes on a tap outside, on Escape, and when
 * focus leaves, handing focus back to the button each time.
 *
 * What it does NOT do is manage categories. Renaming, reordering and deleting stay behind the Categories
 * button next to Export, where GRW-428 put them. Choosing what to look at and editing what exists are
 * different jobs, and a list that does both turns every mis-tap into a destructive one.
 */
export interface CategoryOption {
  id: string;
  name: string;
}

export function CategoryPicker({
  tab,
  categories,
  counts,
  showRetired,
  onPick,
}: {
  tab: ServiceTab;
  categories: readonly CategoryOption[];
  counts: { all: number; retired: number; byCategory: Map<string, number> };
  showRetired: boolean;
  onPick: (tab: ServiceTab) => void;
}) {
  const t = useTranslations('services');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // `pointerdown`, not `click`: it closes before the tap lands, so the thing tapped still gets it.
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element && rootRef.current?.contains(e.target))) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chosen =
    tab === ALL_TAB
      ? { label: t('all'), count: counts.all }
      : tab === RETIRED_TAB
        ? { label: t('retired'), count: counts.retired }
        : {
            label: categories.find((c) => c.id === tab)?.name ?? t('all'),
            count: counts.byCategory.get(tab) ?? 0,
          };

  const pick = (next: ServiceTab) => {
    setOpen(false);
    buttonRef.current?.focus();
    onPick(next);
  };

  const row = (key: string, value: ServiceTab, label: string, count: number) => (
    <button key={key} type="button" aria-current={tab === value ? 'true' : undefined} onClick={() => pick(value)}>
      <strong>{label}</strong>
      <span>{t('categoryPicker.count', { count })}</span>
    </button>
  );

  return (
    <div
      className="svc-catpick"
      ref={rootRef}
      onBlur={(e) => {
        if (open && !(e.relatedTarget instanceof Element && rootRef.current?.contains(e.relatedTarget))) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="svc-catpick-btn"
        aria-expanded={open}
        aria-label={`${t('categoryPicker.label')}: ${chosen.label}`}
        onClick={() => setOpen(!open)}
      >
        <span className="svc-catpick-name">{chosen.label}</span>
        <span className="svc-catpick-count">{chosen.count}</span>
        <IconChevronDown />
      </button>
      {open ? (
        <div className="svc-catpick-menu" role="group" aria-label={t('categoryPicker.label')}>
          {row('all', ALL_TAB, t('all'), counts.all)}
          {categories.map((c) => row(c.id, c.id, c.name, counts.byCategory.get(c.id) ?? 0))}
          {/* Last, and only when there is something in it — the Retired tab's rule (GRW-437), unchanged. */}
          {showRetired ? row('retired', RETIRED_TAB, t('retired'), counts.retired) : null}
        </div>
      ) : null}
    </div>
  );
}
