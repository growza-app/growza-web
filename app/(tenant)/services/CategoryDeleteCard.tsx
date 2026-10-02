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
 * Delete means delete (Jira GRW-431): the service row goes, and its bookings keep the name and price they were
 * taken at (GRW-430). Taking something off the menu for the season is a different thing and still offered, as
 * the quieter second action — an owner who wants it back next winter should not have to retype it.
 *
 * Nothing here can be undone, so everything here confirms. The one exception is that second action: a
 * retirement is one tap from being restored on the Services screen.
 */
export function CategoryDeleteCard({
  branchId,
  category,
  services,
  onClose,
  onDone,
  onChanged,
}: {
  branchId: string;
  category: ServiceCategoryAdmin;
  /** Every service of this category, retired ones included. */
  services: ServiceAdmin[];
  onClose: () => void;
  /** Called after the write, with `gone` true when the category itself was deleted. */
  onDone: (gone: boolean) => void;
  /** Called after a write that left the card open, so the list behind it reloads. */
  onChanged: () => void;
}) {
  const t = useTranslations('services.categories');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** Jira GRW-431 — the ones the catalogue itself would not let go, and what is in the way of each. */
  const [blocked, setBlocked] = useState<Array<{ id: string; name: string; blockers: { offers: Array<{ title: string }>; questions: Array<{ label: string }>; waitingInQueue: number } }>>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  useDialog(cardRef, { onClose: busy ? undefined : onClose });

  const empty = services.length === 0;
  const allSelected = !empty && selected.size === services.length;
  /** For the retire path only: an already-retired service ticked by "Select all" is not a second retirement. */
  const willRetire = services.filter((s) => selected.has(s.id) && s.active).length;
  const takesCategory = allSelected || empty;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /**
   * `mode` is which of the two things the owner asked for. Both end at the same place — those services are off
   * the menu — but one of them is final and the other is not, so they are never the same button.
   */
  const run = async (mode: 'delete' | 'retire') => {
    setBusy(true);
    setError(null);
    try {
      let stuck: typeof blocked = [];
      if (selected.size > 0) {
        if (mode === 'delete') {
          const result = await api.deleteServices(branchId, [...selected]);
          stuck = result.blocked;
        } else {
          await api.retireServices(branchId, [...selected]);
        }
      }
      // A category whose services could not all go is not empty, so it stays — and the card says why.
      if (takesCategory && stuck.length === 0 && mode === 'delete') await api.deleteCategory(branchId, category.id);
      if (stuck.length > 0) {
        setBlocked(stuck);
        setSelected(new Set(stuck.map((b) => b.id)));
        setConfirming(false);
        onChanged();
        return;
      }
      onDone(takesCategory && mode === 'delete');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failed'));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const action = empty
    ? t('deleteEmptyAction')
    : selected.size === 0
      ? t('pickSome')
      : allSelected
        ? t('deleteAllAction', { name: category.name, count: services.length })
        : t('deleteAction', { count: selected.size });

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

          {blocked.length > 0 && (
            <div role="alert" className="svc-cat-blocked">
              <p className="svc-cat-blocked-head">{t('blockedHead', { count: blocked.length })}</p>
              <ul>
                {blocked.map((b) => (
                  <li key={b.id}>
                    <b>{b.name}</b> —{' '}
                    {b.blockers.offers.length > 0
                      ? t('blockedByOffer', { offers: b.blockers.offers.map((o) => o.title).join(', ') })
                      : b.blockers.questions.length > 0
                        ? t('blockedByQuestion', { questions: b.blockers.questions.map((q) => q.label).join(', ') })
                        : t('blockedByQueue')}
                  </li>
                ))}
              </ul>
              <p className="svc-cat-blocked-foot">{t('blockedFoot')}</p>
            </div>
          )}

          {empty ? (
            <p className="svc-cat-meta">{t('emptyDetail')}</p>
          ) : (
            <ul className="svc-cat-list">
              {/*
               * First, where the owner asked for it, and still worded as a consequence rather than a
               * convenience — a tick that quietly also deletes the category would be a trap, wherever it sits.
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
            onClick={() => setConfirming(true)}
          >
            {busy ? t('working') : action}
          </button>
          {/*
            * The seasonal case, kept and kept quiet: an owner who wants it back next winter should not have to
            * type it in again. Ghost, below, and never beside the delete as a second coloured button.
            */}
          {!empty && willRetire > 0 && (
            <button type="button" className="btn btn-ghost svc-cat-retire" disabled={busy} onClick={() => void run('retire')}>
              {t('retireInstead', { count: willRetire })}
            </button>
          )}
          <button type="button" className="btn btn-ghost svc-cat-cancel" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
        )}

        {/*
         * Every delete confirms, because none of them can be undone — which is the one way this differs from
         * the card before Jira GRW-431, when the partial action was a reversible retirement and went straight
         * through. The retire button beside it still does.
         *
         * Inside the card rather than on top of it: a fourth floating layer over page, sheet and card is one
         * more than anybody can follow their way back out of.
         */}
        {confirming && (
          <div className="svc-cat-confirm" role="alertdialog" aria-label={t('deleteTitle', { name: category.name })}>
            <p className="svc-cat-confirm-body">
              {empty
                ? t('deleteBodyEmpty')
                : allSelected
                  ? t('deleteAllBody', { name: category.name, count: services.length })
                  : t('deleteSomeBody', { count: selected.size })}
            </p>
            <p className="svc-cat-confirm-detail">{t('deleteDetail')}</p>
            <div className="svc-cat-confirm-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
                {t('cancel')}
              </button>
              <button type="button" className="btn btn-danger-solid" disabled={busy} onClick={() => void run('delete')}>
                {busy ? t('working') : t('delete')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
