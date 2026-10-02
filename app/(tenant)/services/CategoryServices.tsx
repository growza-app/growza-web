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
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <div className="svc-cat-head">
        <button type="button" className="svc-cat-back" onClick={onBack}>
          <span aria-hidden="true">‹</span> {t('back')}
        </button>
        <div className="svc-cat-head-name">{category.name}</div>
        <button type="button" className="btn btn-ghost btn-danger svc-cat-head-delete" onClick={() => setDeleting(true)}>
          {t('delete')}
        </button>
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

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {t('back')}
        </button>
      </div>

      {deleting && (
        <CategoryDeleteCard
          branchId={branchId}
          category={category}
          services={services}
          onClose={() => setDeleting(false)}
          onDone={(gone) => {
            setDeleting(false);
            onChanged(gone);
          }}
        />
      )}
    </>
  );
}
