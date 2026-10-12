'use client';

import { useTranslations } from 'next-intl';
import type { DragEvent } from 'react';
import type { ServiceCategoryAdmin } from '../lib/api';

/** Jira GRW-592 — reading the list, reordering and renaming it, or picking rows off it. */
export type CategoryRowMode = 'read' | 'edit' | 'pick';
import { IconArrowDown, IconArrowUp, IconCheck, IconChevronRight, IconEdit, IconGrip } from '../components/icons';

/**
 * Jira GRW-591 · GRW-592 — one category, in one of the three states the sheet can be in.
 *
 * | Mode   | The row is                              | Reached by      |
 * |--------|-----------------------------------------|-----------------|
 * | `read` | name · count · chevron — opens it       | the default     |
 * | `edit` | handle · name (renames) · ✎ · ↑ ↓       | Edit, on the title |
 * | `pick` | tick · name · count                     | Delete, on the title |
 *
 * Three modes and not two because reordering and deleting are different jobs with different controls, and
 * a row that carried both came to five things in 252px — the name column fell to 72px, which is four
 * characters. Separating them gives each mode the width its own controls need, and means an owner who
 * wants to delete something never has to find it behind a button called Edit.
 *
 * Its own file because the states are the whole point and were impossible to see — or to test — while they
 * were ninety lines of nested ternaries inside the sheet.
 */
export function CategoryRow({
  row,
  mode,
  orderable,
  busy,
  atTop,
  atBottom,
  dragging,
  selected,
  onToggle,
  onOpen,
  onRename,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  row: ServiceCategoryAdmin;
  /** Which of the sheet's three states this row is drawn in. */
  mode: CategoryRowMode;
  /** Whether there is an order to change. One category has a name to fix but no position to move. */
  orderable: boolean;
  busy: boolean;
  atTop: boolean;
  atBottom: boolean;
  dragging: boolean;
  /** Jira GRW-592 — ticked for deletion. Only ever true in `pick`. */
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onRename: () => void;
  onMove: (by: -1 | 1) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const t = useTranslations('services.categories');
  const editing = mode === 'edit';
  const picking = mode === 'pick';
  const controls = editing && orderable;

  return (
    <li className={`svc-cat-row ${dragging ? 'is-dragging' : ''} ${selected ? 'is-picked' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      {/*
        Jira GRW-592 — the tick, at the leading edge, which is where a list that can be emptied puts it.
        In `pick` only: it is the one control of that mode, so the whole row is given to it and the name
        keeps its full width.
      */}
      {picking && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          className="svc-cat-tick"
          disabled={busy}
          aria-label={t('pickAria', { name: row.name })}
          onClick={onToggle}
        >
          <span className="svc-cat-tick-box" aria-hidden="true">
            {selected ? <IconCheck /> : null}
          </span>
        </button>
      )}

      {/*
        The handle, not the whole row, is draggable: the row's own job is to open the category, and a row
        that both opens and drags does neither reliably.

        Jira GRW-592 — and it is the one control that gives way on a phone. Four controls do not fit in a
        252px row; the handle is the one that can go, because HTML5 drag does not fire on touch anyway
        (GRW-441) — the arrows beside it are what a thumb actually reorders with. On a pointer, where the
        width is there and drag works, `.svc-cat-grip` comes back at 480px.
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
          <IconGrip />
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
        onClick={editing ? onRename : picking ? onToggle : onOpen}
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
              three when it would free five is the one way this screen can mislead. Which is exactly why
              it stays on screen in `pick`, where that number is the consequence being decided.
            */}
            <span className="svc-cat-meta">
              {row.serviceCount === 0
                ? t('empty')
                : row.serviceCount === row.activeCount
                  ? t('count', { count: row.serviceCount })
                  : t('countWithRetired', { count: row.serviceCount, retired: row.serviceCount - row.activeCount })}
            </span>
            {!picking && (
              <span className="svc-cat-chevron" aria-hidden="true">
                <IconChevronRight />
              </span>
            )}
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
            <IconArrowUp />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={busy || atBottom}
            aria-label={t('moveDownAria', { name: row.name })}
            onClick={() => onMove(1)}
          >
            <IconArrowDown />
          </button>
        </div>
      )}
    </li>
  );
}
