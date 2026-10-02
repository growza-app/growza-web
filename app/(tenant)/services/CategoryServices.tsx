'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { api, formatMoney, type ServiceAdmin, type ServiceCategoryAdmin } from '../lib/api';
import { ConfirmDialog } from '../components/ConfirmDialog';

/**
 * Jira GRW-428 — one category opened, with its services to tick.
 *
 * The owner's model (2026-10-02): tick a few services to take them off the menu, or tick them all, which means
 * the category goes too. Rather than two separate commands with two separate confirmations, there is one
 * selection and the button at the foot says what that selection will do.
 *
 * Services are RETIRED, never deleted, and the words say so. `service.id` is referenced by `appointment`,
 * `provider_service` and `offer_service` with no cascade, so a hard delete of anything with history fails at
 * the database — GRW-30's conclusion, unchanged by being asked for from a different screen. The category row
 * itself is deleted outright, because nothing but `service.category_id` points at it.
 *
 * The already-retired are shown, dimmed and badged, and "Select all" takes them too: otherwise "everything is
 * selected" would stop meaning "the whole category goes" the moment one service had been retired earlier.
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
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const allSelected = services.length > 0 && selected.size === services.length;
  const toRetire = useMemo(() => services.filter((s) => selected.has(s.id) && s.active).length, [services, selected]);

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
      // stay separate things on the server even though one button asks for both.
      if (selected.size > 0) await api.retireServices(branchId, [...selected]);
      if (allSelected || services.length === 0) await api.deleteCategory(branchId, category.id);
      setConfirming(false);
      // Spent: the ticks are what was just done, and leaving them on reads as work still to do.
      setSelected(new Set());
      onChanged(allSelected || services.length === 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failed'));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const empty = services.length === 0;
  const actionLabel = empty
    ? t('deleteEmptyAction')
    : selected.size === 0
      ? t('pickSome')
      : allSelected
        ? t('deleteAllAction', { name: category.name, count: services.length })
        : t('retireAction', { count: selected.size });

  return (
    <>
      <div className="svc-cat-head">
        <button type="button" className="svc-cat-back" onClick={onBack} disabled={busy}>
          <span aria-hidden="true">‹</span> {t('back')}
        </button>
        <div className="svc-cat-head-name">{category.name}</div>
        {!empty && (
          <button
            type="button"
            className="btn btn-ghost svc-cat-selectall"
            disabled={busy}
            onClick={() => setSelected(allSelected ? new Set() : new Set(services.map((s) => s.id)))}
          >
            {allSelected ? t('clearAll') : t('selectAll')}
          </button>
        )}
      </div>

      <div className="modal-body">
        {error && (
          <div role="alert" className="field-error" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}

        {empty ? (
          <p className="svc-cat-meta">{t('emptyDetail')}</p>
        ) : (
          <>
            <p className="svc-cat-count">{t('selectedCount', { count: selected.size, total: services.length })}</p>
            <ul className="svc-cat-list">
              {services.map((s) => {
                const on = selected.has(s.id);
                return (
                  <li key={s.id}>
                    {/* The whole row is the control: a 20px box beside a 15px name is a target only a mouse can hit. */}
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
          </>
        )}
      </div>

      <div className="modal-actions svc-cat-foot">
        <button
          type="button"
          className={`btn svc-cat-action ${empty || selected.size > 0 ? 'btn-danger-solid' : ''}`}
          disabled={busy || (!empty && selected.size === 0)}
          onClick={() => setConfirming(true)}
        >
          {actionLabel}
        </button>
        {!empty && selected.size > 0 && <p className="svc-cat-foot-hint">{t('retireHint')}</p>}
      </div>

      {confirming && (
        <ConfirmDialog
          title={allSelected || empty ? t('deleteTitle', { name: category.name }) : t('retireTitle', { count: toRetire })}
          body={
            empty
              ? t('deleteBodyEmpty')
              : allSelected
                ? t('deleteAllBody', { count: toRetire, total: services.length })
                : t('retireBody', { count: toRetire })
          }
          detail={t('deleteDetail')}
          confirmLabel={allSelected || empty ? t('delete') : t('retire')}
          tone="danger"
          busy={busy}
          onConfirm={() => void run()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
