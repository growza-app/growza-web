'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, type ServiceAdmin, type ServiceCategoryAdmin } from '../lib/api';
import { IconArrowDown, IconArrowUp, IconClose, IconEdit, IconGrip, IconPlus, IconTrash } from '../components/icons';
import { useDialog } from '../../shared/a11y/useDialog';
import { movedOrder } from './category-order';

/** What `api.deleteServices` reports for a service it would not delete, and why. */
type BlockedService = {
  id: string;
  name: string;
  blockers: { offers: Array<{ title: string }>; questions: Array<{ label: string }>; waitingInQueue: number };
};

/**
 * Owner, 2026-10-14 — the categories on a desk: one dialog, one state.
 *
 * `CategoriesSheet` is the phone's: three modes (read, edit, pick) because a 344px row cannot carry a name and
 * four controls at once. A 560px dialog can, so there are no modes here. Every row is grip · name · count ·
 * ↑ ↓ ✎ 🗑, the controls quiet until the pointer is over the row (and always there for a keyboard), a rename
 * happens in the row, a delete asks in the row, and the footer is Done. The writes are the sheet's, call for
 * call — a delete takes the services with it and reports the ones a package or a queue holds.
 */
export function DeskCategoriesDialog({
  branchId,
  initial,
  services,
  onClose,
  onChanged,
}: {
  branchId: string;
  initial: ServiceCategoryAdmin[];
  /** Every service of this branch, retired ones included — a delete counts its category's own. */
  services: ServiceAdmin[];
  onClose: () => void;
  /** Called after anything is written, so the screen behind reloads. */
  onChanged: () => void;
}) {
  const t = useTranslations('services.categories');
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [askingId, setAskingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<BlockedService[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  useDialog(dialogRef, { onClose: busy ? undefined : onClose });

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);
  useEffect(() => {
    if (addOpen) addRef.current?.focus();
  }, [addOpen]);

  /** One place for every write: the server's message is the owner's message, never a generic "failed". */
  const run = async <T,>(work: () => Promise<T>, after: (result: T) => void) => {
    setBusy(true);
    setError(null);
    try {
      after(await work());
      onChanged();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('errors.failed'));
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
        addRef.current?.focus();
      },
    );
  };

  const rename = async (row: ServiceCategoryAdmin) => {
    const name = renameText.trim();
    if (!name || name === row.name) {
      setRenamingId(null);
      return;
    }
    await run(
      () => api.renameCategory(branchId, row.id, name),
      (saved) => {
        setRows((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        setRenamingId(null);
      },
    );
  };

  /** Shown moved at once, put back if the save fails (Jira GRW-441). */
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

  /** Services first, then the category — a service a package or a queue holds stays, and so does its category. */
  const remove = async (row: ServiceCategoryAdmin) => {
    const serviceIds = services.filter((s) => s.categoryId === row.id).map((s) => s.id);
    setBusy(true);
    setError(null);
    setBlocked([]);
    let wrote = false;
    try {
      let stuck: BlockedService[] = [];
      if (serviceIds.length > 0) {
        stuck = (await api.deleteServices(branchId, serviceIds)).blocked;
        wrote = true;
      }
      if (stuck.length > 0) {
        setBlocked(stuck);
        setRows(await api.categoriesAtBranch(branchId).catch(() => rows));
      } else {
        await api.deleteCategory(branchId, row.id);
        wrote = true;
        setRows((prev) => prev.filter((c) => c.id !== row.id));
      }
      setAskingId(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('errors.failed'));
    } finally {
      if (wrote) onChanged();
      setBusy(false);
    }
  };

  const countOf = (row: ServiceCategoryAdmin) =>
    row.serviceCount === 0
      ? t('empty')
      : row.serviceCount === row.activeCount
        ? t('count', { count: row.serviceCount })
        : t('countWithRetired', { count: row.serviceCount, retired: row.serviceCount - row.activeCount });

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal svc-catd" role="dialog" aria-modal="true" aria-labelledby="svc-catd-title" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <div className="svc-catd-head">
          <div>
            <h2 id="svc-catd-title" className="svc-catd-title">
              {t('title')}
            </h2>
            <p className="svc-catd-sub">{t('deskHint')}</p>
          </div>
          <button type="button" className="icon-btn svc-catd-x" aria-label={t('close')} disabled={busy} onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="svc-catd-body">
          {error && (
            <div role="alert" className="field-error svc-catd-error">
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

          {rows.length === 0 && <p className="svc-catd-none">{t('none')}</p>}

          <ul className="svc-catd-list">
            {rows.map((row, i) => (
              <li
                key={row.id}
                className={`svc-catd-row ${dragFrom === i ? 'is-dragging' : ''} ${askingId === row.id ? 'is-asking' : ''}`}
                onDragOver={(e) => {
                  if (dragFrom !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) void moveTo(dragFrom, i);
                  setDragFrom(null);
                }}
              >
                {askingId === row.id ? (
                  /* The question, in the row it is about: what goes with it, and the one button that does it. */
                  <div className="svc-catd-ask" role="group" aria-label={t('deleteOne', { name: row.name })}>
                    <div className="svc-catd-ask-text">
                      <b>{t('deleteOne', { name: row.name })}</b>
                      <span>{row.serviceCount > 0 ? t('deleteOneGoes', { count: row.serviceCount }) : t('deleteOneEmpty')}</span>
                    </div>
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setAskingId(null)}>
                      {t('cancel')}
                    </button>
                    <button type="button" className="btn btn-danger-solid" disabled={busy} onClick={() => void remove(row)}>
                      {busy ? t('working') : t('delete')}
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      className="svc-catd-grip"
                      draggable={!busy && rows.length > 1}
                      aria-hidden="true"
                      title={t('dragAria', { name: row.name })}
                      onDragStart={() => setDragFrom(i)}
                      onDragEnd={() => setDragFrom(null)}
                    >
                      <IconGrip />
                    </span>
                    {renamingId === row.id ? (
                      <input
                        ref={renameRef}
                        className="svc-catd-rename"
                        type="text"
                        value={renameText}
                        maxLength={60}
                        aria-label={t('renameAria', { name: row.name })}
                        disabled={busy}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setRenameText(e.target.value)}
                        onBlur={() => void rename(row)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void rename(row);
                          if (e.key === 'Escape') {
                            e.nativeEvent.stopImmediatePropagation();
                            setRenamingId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="svc-catd-name"
                        disabled={busy}
                        title={t('renameAria', { name: row.name })}
                        onClick={() => {
                          setRenamingId(row.id);
                          setRenameText(row.name);
                        }}
                      >
                        {row.name}
                      </button>
                    )}
                    <span className="svc-catd-count">{countOf(row)}</span>
                    <div className="svc-catd-actions">
                      <button type="button" className="icon-btn" disabled={busy || i === 0} aria-label={t('moveUpAria', { name: row.name })} onClick={() => void moveTo(i, i - 1)}>
                        <IconArrowUp />
                      </button>
                      <button type="button" className="icon-btn" disabled={busy || i === rows.length - 1} aria-label={t('moveDownAria', { name: row.name })} onClick={() => void moveTo(i, i + 1)}>
                        <IconArrowDown />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={busy}
                        aria-label={t('renameAria', { name: row.name })}
                        onClick={() => {
                          setRenamingId(row.id);
                          setRenameText(row.name);
                        }}
                      >
                        <IconEdit />
                      </button>
                      <button type="button" className="icon-btn svc-catd-trash" disabled={busy} aria-label={t('deleteAria', { name: row.name })} onClick={() => setAskingId(row.id)}>
                        <IconTrash />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
            <li className="svc-catd-row svc-catd-addrow">
              {addOpen ? (
                <>
                  <input
                    ref={addRef}
                    type="text"
                    className="svc-catd-rename"
                    value={adding}
                    maxLength={60}
                    placeholder={t('addPlaceholder')}
                    aria-label={t('addPlaceholder')}
                    disabled={busy}
                    onChange={(e) => setAdding(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void add();
                      if (e.key === 'Escape') {
                        e.nativeEvent.stopImmediatePropagation();
                        setAddOpen(false);
                        setAdding('');
                      }
                    }}
                  />
                  <button type="button" className="btn" disabled={busy || !adding.trim()} onClick={() => void add()}>
                    {t('add')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      setAddOpen(false);
                      setAdding('');
                    }}
                  >
                    {t('cancel')}
                  </button>
                </>
              ) : (
                <button type="button" className="svc-catd-add" disabled={busy} onClick={() => setAddOpen(true)}>
                  <IconPlus />
                  <span>{t('addOpen')}</span>
                </button>
              )}
            </li>
          </ul>
        </div>

        <div className="svc-catd-foot">
          <span className="svc-catd-foot-hint">{t('deskOrderHint')}</span>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  );
}
