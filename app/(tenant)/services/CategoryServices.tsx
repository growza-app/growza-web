'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatMoney, type ServiceAdmin, type ServiceCategoryAdmin } from '../lib/api';
import { CategoryDeleteCard } from './CategoryDeleteCard';

/**
 * Jira GRW-428 — one category opened: what is in it, and the way to take things out.
 *
 * A plain list. The owner's call (2026-10-02): choosing what to remove is a deliberate step behind "Delete" at
 * the top, not a bar of ticks and a red button across the bottom of every category they open to look at.
 *
 * So this screen answers "what is in Hair?" and nothing else; `CategoryDeleteCard` answers "what should come
 * out of it?". Retired services are shown with their badge, because an owner looking at a category wants to see
 * the whole of it, not only what is bookable today.
 */
export function CategoryServices({
  branchId,
  category,
  services,
  onBack,
  onChanged,
}: {
  branchId: string;
  category: ServiceCategoryAdmin;
  /** Every service of this category at this branch, retired ones included. */
  services: ServiceAdmin[];
  onBack: () => void;
  /** Called after a write, with `gone` true when the category itself was deleted. */
  onChanged: (gone: boolean) => void;
}) {
  const t = useTranslations('services.categories');
  /**
   * Jira GRW-590 — which of the two the owner asked for, or null.
   *
   * `'all'` opens the card with everything ticked; `'some'` opens it with nothing ticked, to be chosen. They
   * are two buttons because they are two intentions, and one of them used to be reachable only by noticing a
   * tick called "Select all" sitting in a list of services and looking exactly like them. Owners reported
   * they could not delete a category at all and were removing services one at a time — the honest reading of
   * a control that was there but invisible.
   */
  const [deleting, setDeleting] = useState<'all' | 'some' | null>(null);
  const empty = services.length === 0;

  return (
    <>
      <div className="svc-cat-head">
        <button type="button" className="svc-cat-back" onClick={onBack}>
          <span aria-hidden="true">‹</span> {t('back')}
        </button>
        <div className="svc-cat-head-name">{category.name}</div>

      </div>

      <div className="modal-body">
        {services.length === 0 ? (
          <p className="svc-cat-meta">{t('emptyDetail')}</p>
        ) : (
          <ul className="svc-cat-list">
            {services.map((s) => (
              <li key={s.id} className={`svc-shown ${s.active ? '' : 'is-retired'}`}>
                <span className="svc-pick-name">
                  {s.name}
                  {!s.active && <span className="chip chip-completed">{t('retiredChip')}</span>}
                </span>
                <span className="svc-cat-meta">
                  {t('minutes', { count: s.durationMin })} · {formatMoney(s.priceMinor, s.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        Jira GRW-590 — both ways out of a category, said plainly and in the order they are wanted. The whole
        category first, because that is what the owner comes here to do; picking a few is the quieter one.
        Neither does anything yet: each opens the card that lists what goes and asks.
      */}
      <div className="modal-actions svc-cat-ways">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {t('back')}
        </button>
        {!empty && (
          <button type="button" className="btn btn-ghost" onClick={() => setDeleting('some')}>
            {t('removeSome')}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-danger" onClick={() => setDeleting('all')}>
          {empty ? t('deleteEmptyAction') : t('deleteWholeCategory', { count: services.length })}
        </button>
      </div>

      {deleting && (
        <CategoryDeleteCard
          branchId={branchId}
          category={category}
          services={services}
          preselect={deleting === 'all' ? 'all' : 'none'}
          onClose={() => setDeleting(null)}
          onDone={(gone) => {
            setDeleting(null);
            onChanged(gone);
          }}
          // A delete that left some services behind keeps the card open; the list behind it still has to reload.
          onChanged={() => onChanged(false)}
        />
      )}
    </>
  );
}
