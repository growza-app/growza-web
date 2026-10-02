'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, type ServiceAdmin, type ServiceCategoryAdmin } from '../lib/api';
import { IconEdit, IconPlus } from '../components/icons';
import { CategoryServices } from './CategoryServices';
import { movedOrder, unsorted, worthOrdering } from './category-order';
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
 * Jira GRW-441 — reordering is a drag OR the ↑/↓ buttons, and the buttons are not a fallback to apologise
 * for: a keyboard reaches them, a thumb does not have to be precise with them, and HTML5 drag does not fire
 * on touch at all. The whole branch's order goes to the server in one call whichever is used.
 */
export function CategoriesSheet({
  branchId,
  initial,
  services,
  onClose,
  onChanged,
}: {
  /** Jira GRW-378 — the branch on screen. A category belongs to one branch; nothing here reaches another. */
  branchId: string;
  initial: ServiceCategoryAdmin[];
  /** Every service of this branch, retired ones included — a category's own are picked out of it. */
  services: ServiceAdmin[];
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
  /** The category opened into its own list of services; the sheet shows one or the other, never both. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** Jira GRW-441 — the row being dragged, by index. Null whenever nothing is in flight. */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
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

  /**
   * Moves one row and sends the WHOLE order: the server refuses a partial list rather than half-applying it.
   *
   * Jira GRW-441 — and puts the rows BACK if that write fails. They were shown moved straight away (this is a
   * two-tap-in-a-row control and must not feel laggy), which meant a failed save left the screen showing an
   * order the server did not have — the owner closed the sheet believing it was saved.
   */
  const moveTo = async (from: number, to: number) => {
    const next = movedOrder(rows, from, to);
    if (next.length !== rows.length || next.every((c, i) => c.id === rows[i]?.id)) return;
    const before = rows;
    setRows(next);
    setBusy(true);
    setError(null);
    try {
      setRows(await api.reorderCategories(branchId, next.map((c) => c.id)));
      onChanged();
    } catch (err) {
      setRows(before);
      setError(err instanceof Error && err.message ? err.message : t('reorderFailed'));
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, by: -1 | 1) => moveTo(index, index + by);

  // Looked up by id rather than held as an object, so a count that changed behind the detail view is the one shown.
  const open = rows.find((c) => c.id === openId) ?? null;
  /** Jira GRW-441 — a handle, two arrows and a sentence about order, above a list of one, change nothing. */
  const orderable = worthOrdering(rows);
  const loose = unsorted(services);

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
          {open ? (
            <CategoryServices
              branchId={branchId}
              category={open}
              services={services.filter((s) => s.categoryId === open.id)}
              onBack={() => setOpenId(null)}
              onChanged={async (gone) => {
                if (gone) {
                  setRows((prev) => prev.filter((c) => c.id !== open.id));
                  setOpenId(null);
                } else {
                  // A retire changed this category's counts; re-read rather than guess at them here.
                  setRows(await api.categoriesAtBranch(branchId).catch(() => rows));
                }
                onChanged();
              }}
            />
          ) : (
            <>
          <h3>{t('title')}</h3>
          {/* Jira GRW-441 — say what the order is FOR. One category is not an order, so the sentence waits. */}
          <p className="svc-cat-hint">{orderable ? t('orderHint') : t('hint')}</p>

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
                  <li
                    className={`svc-cat-row ${dragFrom === i ? 'is-dragging' : ''}`}
                    key={row.id}
                    onDragOver={(e) => {
                      if (dragFrom !== null) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom !== null) void moveTo(dragFrom, i);
                      setDragFrom(null);
                    }}
                  >
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
                        {/*
                          The handle, not the whole row, is draggable: the row's own job is to open the
                          category, and a row that both opens and drags does neither reliably.
                        */}
                        {orderable && (
                          <span
                            className="svc-cat-grip"
                            draggable={!busy}
                            aria-hidden="true"
                            title={t('dragAria', { name: row.name })}
                            onDragStart={() => setDragFrom(i)}
                            onDragEnd={() => setDragFrom(null)}
                          >
                            ⠿
                          </span>
                        )}
                        {/* The row opens the category — removing services, and the category itself, happens in there. */}
                        <button type="button" className="svc-cat-text" disabled={busy} onClick={() => setOpenId(row.id)}>
                          <span className="svc-cat-name">{row.name}</span>
                          <span className="svc-cat-meta">
                            {row.serviceCount === 0
                              ? t('empty')
                              : row.serviceCount === row.activeCount
                                ? t('count', { count: row.serviceCount })
                                : t('countWithRetired', { count: row.serviceCount, retired: row.serviceCount - row.activeCount })}
                          </span>
                          <span className="svc-cat-chevron" aria-hidden="true">›</span>
                        </button>
                        <div className="svc-cat-actions">
                          {orderable && (
                            <>
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
                            </>
                          )}
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

            {/* The thing an owner cannot otherwise find out: an empty category is invisible to customers. */}
            <p className="svc-cat-foot">{t('emptyStayHidden')}</p>

            {/*
              Jira GRW-441 — Unsorted is NOT a category. It cannot be renamed, reordered or deleted; it is a
              view of the services whose `category_id` is null, which are hidden from the booking page with
              nothing on any screen saying so.
            */}
            {loose.length > 0 && (
              <div className="svc-cat-unsorted">
                <div className="svc-cat-unsorted-head">
                  <span className="svc-cat-name">{t('unsorted')}</span>
                  <span className="svc-cat-meta">{t('unsortedCount', { count: loose.length })}</span>
                </div>
                <ul className="svc-cat-unsorted-list">
                  {loose.map((s) => (
                    <li key={s.id}>{s.name}</li>
                  ))}
                </ul>
                <p className="svc-cat-foot">{t('unsortedHint')}</p>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
              {t('done')}
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
