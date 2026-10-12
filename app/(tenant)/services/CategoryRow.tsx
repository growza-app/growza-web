'use client';

import { useTranslations } from 'next-intl';
import type { DragEvent } from 'react';
import type { ServiceCategoryAdmin } from '../lib/api';
import { IconEdit } from '../components/icons';

/**
 * Jira GRW-591 — one category, in one of the two states the sheet can be in.
 *
 * Reading the list, the row is a single line: name, count, chevron, and it opens the category. Editing it,
 * the same line gains a drag handle and the two arrows, and the name itself becomes the rename.
 *
 * Its own file because the two states are the whole point and were impossible to see — or to test — while
 * they were ninety lines of nested ternaries inside the sheet. The row renders no delete in either state:
 * removing services, and the category with them, lives in the detail view (owner's change, 2026-10-02).
 */
export function CategoryRow({
  row,
  editing,
  orderable,
  busy,
  atTop,
  atBottom,
  dragging,
  onOpen,
  onRename,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  row: ServiceCategoryAdmin;
  /** Whether the sheet is in edit mode. The row carries no controls at all when it is not. */
  editing: boolean;
  /** Whether there is an order to change. One category has a name to fix but no position to move. */
  orderable: boolean;
  busy: boolean;
  atTop: boolean;
  atBottom: boolean;
  dragging: boolean;
  onOpen: () => void;
  onRename: () => void;
  onMove: (by: -1 | 1) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const t = useTranslations('services.categories');
  const controls = editing && orderable;

  return (
    <li className={`svc-cat-row ${dragging ? 'is-dragging' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      {/*
        The handle, not the whole row, is draggable: the row's own job is to open the category, and a row
        that both opens and drags does neither reliably.
      */}
      {controls && (
        <span
          className="svc-cat-grip"
          draggable={!busy}
          aria-hidden="true"
          title={t('dragAria', { name: row.name })}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          ⠿
        </span>
      )}

      {/*
        One button, two jobs, decided by the mode. Reading the list it opens the category; editing it, it is
        the rename — tapping the name is how a name is changed on a list like this, and it costs no width,
        which is exactly what a fourth 44px button on every row did cost.
      */}
      <button
        type="button"
        className="svc-cat-text"
        disabled={busy}
        aria-label={editing ? t('renameAria', { name: row.name }) : undefined}
        onClick={editing ? onRename : onOpen}
      >
        <span className="svc-cat-name">{row.name}</span>
        {editing ? (
          <span className="svc-cat-pencil" aria-hidden="true">
            <IconEdit />
          </span>
        ) : (
          <>
            {/*
              `serviceCount` and not `activeCount`: it is what a delete sets loose, and a row promising
              three when it would free five is the one way this screen can mislead.
            */}
            <span className="svc-cat-meta">
              {row.serviceCount === 0
                ? t('empty')
                : row.serviceCount === row.activeCount
                  ? t('count', { count: row.serviceCount })
                  : t('countWithRetired', { count: row.serviceCount, retired: row.serviceCount - row.activeCount })}
            </span>
            <span className="svc-cat-chevron" aria-hidden="true">
              ›
            </span>
          </>
        )}
      </button>

      {/*
        Jira GRW-441 — the arrows are not a fallback to apologise for: a keyboard reaches them, a thumb does
        not have to be precise with them, and HTML5 drag does not fire on touch at all.
      */}
      {controls && (
        <div className="svc-cat-actions">
          <button
            type="button"
            className="icon-btn"
            disabled={busy || atTop}
            aria-label={t('moveUpAria', { name: row.name })}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={busy || atBottom}
            aria-label={t('moveDownAria', { name: row.name })}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
        </div>
      )}
    </li>
  );
}
