'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, type ServiceCategoryAdmin } from '../lib/api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconEdit, IconPlus } from '../components/icons';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Jira GRW-428 — where an owner names, orders and removes their own categories.
 *
 * Until this, `service_category` had a GET and nothing else: a category existed only as a side effect of
 * seeding or a spreadsheet import, so a typo was permanent and a group the salon had stopped offering stayed in
 * the filter, the booking flow and the combo builder forever.
 *
 * On the app's shared `.modal-fit` shell, which is 380px wide and `100dvh`-aware — a phone sheet that happens
 * to centre itself on a desktop, rather than a desktop dialog squeezed onto a phone. Every row here is one
 * tappable thing with its controls beside it, at 44px, because this is used one-handed at a reception desk.
 *
 * Reordering is ↑/↓ and not drag: a keyboard reaches it, a thumb does not have to be precise, and the whole
 * branch's order goes to the server in one call either way. Drag arrives with the grouped list (GRW-429).
 */
export function CategoriesSheet({
  branchId,
  initial,
  onClose,
  onChanged,
}: {
  /** Jira GRW-378 — the branch on screen. A category belongs to one branch; nothing here reaches another. */
  branchId: string;
  initial: ServiceCategoryAdmin[];
  onClose: () => void;
  /** Called after anything is written, so the Services list behind reloads — a delete frees services it lists. */
  onChanged: () => void;
}) {
  const t = useTranslations('services.categories');
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ServiceCategoryAdmin | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  useDialog(dialogRef, { onClose: busy ? undefined : onClose });

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  /** One place for every write: the server's message is the owner's message, never a generic "failed". */
  const run = async <T,>(work: () => Promise<T>, after: (result: T) => void) => {
    setBusy(true);
    setError(null);
    try {
      after(await work());
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failed'));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    await run(
      () => api.createCategory(branchId, name),
      (created) => {
        setRows((prev) => [...prev, created]);
        setAdding('');
      },
    );
  };

  const rename = async (row: ServiceCategoryAdmin) => {
    const name = editingName.trim();
    if (!name || name === row.name) {
      setEditingId(null);
      return;
    }
    await run(
      () => api.renameCategory(branchId, row.id, name),
      (saved) => {
        setRows((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        setEditingId(null);
      },
    );
  };

  /** Moves one row and sends the WHOLE order: the server refuses a partial list rather than half-applying it. */
  const move = async (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[index], next[to]] = [next[to]!, next[index]!];
    // Shown moved straight away, then confirmed — this is a two-tap-in-a-row control and must not feel laggy.
    setRows(next);
    await run(
      () => api.reorderCategories(branchId, next.map((c) => c.id)),
      (ordered) => setRows(ordered),
    );
  };

  const remove = async (row: ServiceCategoryAdmin) => {
    await run(
      () => api.deleteCategory(branchId, row.id),
      () => {
        setRows((prev) => prev.filter((c) => c.id !== row.id));
        setConfirmDelete(null);
      },
    );
  };

  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
        <div
          className="modal modal-fit"
          role="dialog"
          aria-modal="true"
          aria-label={t('title')}
          ref={dialogRef}
          onClick={(e) => e.stopPropagation()}
        >
          <h3>{t('title')}</h3>
          <p className="svc-cat-hint">{t('hint')}</p>

          <div className="modal-body">
            {error && (
              <div role="alert" className="field-error" style={{ marginBottom: 10 }}>
                {error}
              </div>
            )}

            {rows.length === 0 ? (
              <p className="svc-cat-meta">{t('none')}</p>
            ) : (
              <ul className="svc-cat-list">
                {rows.map((row, i) => (
                  <li className="svc-cat-row" key={row.id}>
                    {editingId === row.id ? (
                      <div className="svc-cat-edit">
                        <input
                          ref={editRef}
                          type="text"
                          value={editingName}
                          maxLength={60}
                          aria-label={t('renameAria', { name: row.name })}
                          // Selected on open: a rename almost always replaces the name rather than appending to it.
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void rename(row);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button type="button" className="btn" disabled={busy} onClick={() => void rename(row)}>
                          {t('save')}
                        </button>
                        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditingId(null)}>
                          {t('cancel')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="svc-cat-text">
                          <div className="svc-cat-name">{row.name}</div>
                          <div className="svc-cat-meta">
                            {row.serviceCount === 0
                              ? t('empty')
                              : row.serviceCount === row.activeCount
                                ? t('count', { count: row.serviceCount })
                                : t('countWithRetired', { count: row.serviceCount, retired: row.serviceCount - row.activeCount })}
                          </div>
                        </div>
                        <div className="svc-cat-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={busy || i === 0}
                            aria-label={t('moveUpAria', { name: row.name })}
                            onClick={() => void move(i, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={busy || i === rows.length - 1}
                            aria-label={t('moveDownAria', { name: row.name })}
                            onClick={() => void move(i, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={busy}
                            aria-label={t('renameAria', { name: row.name })}
                            onClick={() => {
                              setEditingId(row.id);
                              setEditingName(row.name);
                            }}
                          >
                            <IconEdit />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-danger svc-cat-delete"
                            disabled={busy}
                            onClick={() => setConfirmDelete(row)}
                          >
                            {t('delete')}
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="svc-cat-add">
              <input
                type="text"
                value={adding}
                maxLength={60}
                placeholder={t('addPlaceholder')}
                aria-label={t('addPlaceholder')}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void add();
                }}
              />
              <button type="button" className="btn" disabled={busy || !adding.trim()} onClick={() => void add()}>
                <IconPlus /> {t('add')}
              </button>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
              {t('done')}
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={t('deleteTitle', { name: confirmDelete.name })}
          body={confirmDelete.serviceCount === 0 ? t('deleteBodyEmpty') : t('deleteBody', { count: confirmDelete.serviceCount })}
          detail={t('deleteDetail')}
          confirmLabel={t('delete')}
          tone="danger"
          busy={busy}
          onConfirm={() => void remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
