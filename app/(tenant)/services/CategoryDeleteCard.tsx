'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, formatMoney, type ServiceAdmin, type ServiceCategoryAdmin } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Jira GRW-428 — the card that asks what to take out of a category.
 *
 * Opened by "Delete" at the top of a category, which is where the owner asked for it (2026-10-02): the list
 * behind stays a list, and choosing what to remove is a deliberate second step rather than a bar sitting across
 * the bottom of every category they open.
 *
 * One selection, and the button says what it will do with it: some ticked retires those, everything ticked
 * means the category goes too. Ticking everything IS deleting the category, so there is no second command to
 * choose between — which is the whole reason this is one card and not two.
 *
 * Services are RETIRED, never deleted: `service.id` is referenced by `appointment`, `provider_service` and
 * `offer_service` with no cascade. A real delete arrives with Jira GRW-431, once GRW-430 has put the name and
 * price on the booking itself; this card's wording is already the shape that will take.
 *
 * It confirms only what cannot be undone. A retirement is one tap from being restored on the Services screen,
 * so it goes through on the button; deleting the category asks first.
 */
export function CategoryDeleteCard({
  branchId,
  category,
  services,
  onClose,
  onDone,
}: {
  branchId: string;
  category: ServiceCategoryAdmin;
  /** Every service of this category, retired ones included. */
  services: ServiceAdmin[];
  onClose: () => void;
  /** Called after the write, with `gone` true when the category itself was deleted. */
  onDone: (gone: boolean) => void;
}) {
  const t = useTranslations('services.categories');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  useDialog(cardRef, { onClose: busy ? undefined : onClose });

  const empty = services.length === 0;
  const allSelected = !empty && selected.size === services.length;
  /** What will actually change: an already-retired service ticked by "Select all" is not a second retirement. */
  const willRetire = services.filter((s) => selected.has(s.id) && s.active).length;
  const takesCategory = allSelected || empty;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      // Two calls, not one: a retirement is reversible from the Services screen and the delete is not, so they
      // stay separate on the server even though one button asks for both.
      if (selected.size > 0) await api.retireServices(branchId, [...selected]);
      if (takesCategory) await api.deleteCategory(branchId, category.id);
      onDone(takesCategory);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failed'));
      setConfirming(false);
      setBusy(false);
    }
  };

  const action = empty
    ? t('deleteEmptyAction')
    : selected.size === 0
      ? t('pickSome')
      : allSelected
        ? t('deleteAllAction', { name: category.name, count: services.length })
        : t('retireAction', { count: selected.size });

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="modal modal-fit"
        role="dialog"
        aria-modal="true"
        aria-label={t('deleteCardTitle', { name: category.name })}
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t('deleteCardTitle', { name: category.name })}</h3>

        <div className="modal-body">
          {error && (
            <div role="alert" className="field-error" style={{ marginBottom: 10 }}>
              {error}
            </div>
          )}

          {empty ? (
            <p className="svc-cat-meta">{t('emptyDetail')}</p>
          ) : (
            <ul className="svc-cat-list">
              {services.map((s) => {
                const on = selected.has(s.id);
                return (
                  <li key={s.id}>
                    {/* The whole row is the control: a 24px box beside a 15px name is a target only a mouse can hit. */}
                    <button
                      type="button"
                      className={`svc-pick ${s.active ? '' : 'is-retired'}`}
                      role="checkbox"
                      aria-checked={on}
                      disabled={busy}
                      onClick={() => toggle(s.id)}
                    >
                      <span className={`svc-pick-mark ${on ? 'is-on' : ''}`} aria-hidden="true">
                        {on ? '✓' : ''}
                      </span>
                      <span className="svc-pick-text">
                        <span className="svc-pick-name">
                          {s.name}
                          {!s.active && <span className="chip chip-completed">{t('retiredChip')}</span>}
                        </span>
                        <span className="svc-cat-meta">
                          {t('minutes', { count: s.durationMin })} · {formatMoney(s.priceMinor, s.currency)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}

              {/*
               * Last, and worded as a consequence rather than a convenience. "Select all" that quietly also
               * deletes the category would be a trap; this row says what ticking it means before it is ticked.
               */}
              <li>
                <button
                  type="button"
                  className={`svc-pick svc-pick-all ${allSelected ? 'is-on' : ''}`}
                  role="checkbox"
                  aria-checked={allSelected}
                  disabled={busy}
                  onClick={() => setSelected(allSelected ? new Set() : new Set(services.map((s) => s.id)))}
                >
                  <span className={`svc-pick-mark ${allSelected ? 'is-on' : ''}`} aria-hidden="true">
                    {allSelected ? '✓' : ''}
                  </span>
                  <span className="svc-pick-text">
                    <span className="svc-pick-name">{t('selectAll')}</span>
                    <span className="svc-cat-meta">{t('selectAllMeans', { name: category.name })}</span>
                  </span>
                </button>
              </li>
            </ul>
          )}
        </div>

        {/*
          * The confirmation REPLACES the action row rather than stacking under it. Both on screen at once is two
          * Cancels and two Deletes, and an owner reading quickly has no way to tell which pair is live.
          */}
        {!confirming && (
        <div className="modal-actions svc-cat-foot">
          <button
            type="button"
            className={`btn svc-cat-action ${empty || selected.size > 0 ? 'btn-danger-solid' : ''}`}
            disabled={busy || (!empty && selected.size === 0)}
            onClick={() => (takesCategory ? setConfirming(true) : void run())}
          >
            {busy ? t('working') : action}
          </button>
          <button type="button" className="btn btn-ghost svc-cat-cancel" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
          {!empty && selected.size > 0 && !allSelected && <p className="svc-cat-foot-hint">{t('retireHint')}</p>}
        </div>
        )}

        {/*
         * The only thing confirmed, because it is the only thing that cannot be undone. A retirement goes
         * straight through: it is reversible from the Services screen, and asking twice about a reversible
         * action teaches an owner to dismiss dialogs without reading them.
         *
         * Inside the card rather than on top of it: a fourth floating layer over page, sheet and card is one
         * more than anybody can follow their way back out of.
         */}
        {confirming && (
          <div className="svc-cat-confirm" role="alertdialog" aria-label={t('deleteTitle', { name: category.name })}>
            <p className="svc-cat-confirm-body">
              {empty ? t('deleteBodyEmpty') : t('deleteAllBody', { count: willRetire, total: services.length })}
            </p>
            <p className="svc-cat-confirm-detail">{t('deleteDetail')}</p>
            <div className="svc-cat-confirm-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
                {t('cancel')}
              </button>
              <button type="button" className="btn btn-danger-solid" disabled={busy} onClick={() => void run()}>
                {busy ? t('working') : t('delete')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
