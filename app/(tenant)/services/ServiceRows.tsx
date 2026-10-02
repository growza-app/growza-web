'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { formatMoney, type ServiceAdmin } from '../lib/api';
import { servicePhotoUrl } from '../lib/service-photos';
import { useAnchoredPanel } from '../lib/useAnchoredPanel';
import { groupByCategory, timePhrase, worthGrouping } from './services-groups';

/**
 * Jira GRW-439 — the rows of the services list, on a laptop and on a phone.
 *
 * Split out of `ServicesTable` because that file was already over its line budget before this story widened
 * it, and because the two shapes share exactly one thing — what the row can DO — which is the part worth
 * keeping in one place.
 *
 * The rule this story exists for: **no destructive control sits in a row.** Edit, Retire and Delete used to be
 * three buttons side by side in the actions cell, with Delete one pixel from Edit. They live behind a ···
 * menu now, and on a phone behind a deliberate swipe.
 */

/** The owner's own order of category names, so the headings and the tabs cannot disagree (GRW-441). */
export type CategoryOrder = readonly string[];

export interface RowActions {
  onEdit: (s: ServiceAdmin) => void;
  onPhoto: (s: ServiceAdmin) => void;
  /** Only ever offered on a service that has one — see the menu. */
  onRemovePhoto: (s: ServiceAdmin) => void;
  onDuplicate: (s: ServiceAdmin) => void;
  onRetire: (s: ServiceAdmin) => void;
  onRestore: (s: ServiceAdmin) => void;
  onDelete: (s: ServiceAdmin) => void;
  busyId: string | null;
}

type T = ReturnType<typeof useTranslations<'services'>>;

/** The one place the row's time phrase is built, so the card and the table cannot word it differently. */
function time(s: ServiceAdmin, t: T): string {
  return timePhrase(
    s,
    (count) => t('minutes', { count }),
    (count) => t('cleanupPlus', { count }),
  );
}

/**
 * The ··· menu.
 *
 * Anchored to the viewport by `useAnchoredPanel` (Jira GRW-433), so the last row's menu is not cut in half by
 * the card's own `overflow`. Delete is last, red, and separated — the order is edit, then the reversible
 * thing, then the final one.
 */
export function ServiceRowMenu({ service, actions, t }: { service: ServiceAdmin; actions: RowActions; t: T }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const panel = useAnchoredPanel(open, close);
  const run = (fn: (s: ServiceAdmin) => void) => () => {
    setOpen(false);
    fn(service);
  };

  return (
    <div className="dropdown-anchor svc-row-actions" ref={open ? panel.anchorRef : undefined}>
      <button
        type="button"
        className="kebab-btn"
        disabled={actions.busyId === service.id}
        aria-label={t('actionsAria', { name: service.name })}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋮
      </button>
      {open && (
        <div
          className="dropdown-panel dropdown-panel-sm dropdown-panel-right"
          ref={panel.panelRef}
          style={panel.style}
          onMouseLeave={close}
        >
          <button type="button" className="dropdown-item dropdown-item-plain" onClick={run(actions.onEdit)}>
            {t('menu.edit')}
          </button>
          <button type="button" className="dropdown-item dropdown-item-plain" onClick={run(actions.onPhoto)}>
            {service.imageUrl ? t('menu.changePhoto') : t('menu.addPhoto')}
          </button>
          {service.imageUrl && (
            /* The old table had a Remove button in the photo cell. The cell is gone; the capability is not. */
            <button type="button" className="dropdown-item dropdown-item-plain" onClick={run(actions.onRemovePhoto)}>
              {t('menu.removePhoto')}
            </button>
          )}
          <button type="button" className="dropdown-item dropdown-item-plain" onClick={run(actions.onDuplicate)}>
            {t('menu.duplicate')}
          </button>
          <span className="dropdown-sep" />
          {service.active ? (
            <button type="button" className="dropdown-item dropdown-item-plain" onClick={run(actions.onRetire)}>
              {t('menu.retire')} <span className="dropdown-item-hint">{t('menu.retireHint')}</span>
            </button>
          ) : (
            <button type="button" className="dropdown-item dropdown-item-plain" onClick={run(actions.onRestore)}>
              {t('menu.restore')}
            </button>
          )}
          <button type="button" className="dropdown-item dropdown-item-plain dropdown-item-danger" onClick={run(actions.onDelete)}>
            {t('menu.delete')}
          </button>
        </div>
      )}
    </div>
  );
}

/** The photo cell and the name, shared by both shapes. */
function NameCell({ service, t }: { service: ServiceAdmin; t: T }) {
  return (
    <span className="svc-name-cell">
      {service.imageUrl ? (
        <img className="svc-thumb" src={servicePhotoUrl(service)} alt="" width={42} height={42} />
      ) : (
        <span className="svc-thumb svc-thumb-empty" aria-hidden="true" />
      )}
      <span className="svc-name-text">
        <span className="svc-name">{service.name}</span>
        {!service.active && <span className="chip chip-completed svc-retired-chip">{t('retired')}</span>}
      </span>
    </span>
  );
}

/**
 * The laptop's rows: Service · Time · Price · ···
 *
 * "Type" is gone as a column — the category is the heading above the rows now, which is the same information
 * said once instead of on every line.
 */
export function ServiceTableRows({ rows, actions, t, order }: { rows: ServiceAdmin[]; actions: RowActions; t: T; order: CategoryOrder }) {
  const groups = groupByCategory(rows, order);
  const headings = worthGrouping(groups);
  const out: ReactNode[] = [];

  for (const group of groups) {
    if (headings) {
      out.push(
        <tr key={`h-${group.name ?? 'none'}`} className="svc-group-row">
          <th scope="colgroup" colSpan={4} className="svc-group-head">
            {group.name ?? t('unfiled')}
            <span className="svc-group-count">{group.items.length}</span>
          </th>
        </tr>,
      );
    }
    for (const s of group.items) {
      out.push(
        <tr key={s.id} data-row className={s.active ? undefined : 'is-retired'}>
          <td>
            <NameCell service={s} t={t} />
          </td>
          <td className="muted svc-time">{time(s, t)}</td>
          <td className="svc-price">{formatMoney(s.priceMinor, s.currency)}</td>
          <td>
            <ServiceRowMenu service={s} actions={actions} t={t} />
          </td>
        </tr>,
      );
    }
  }
  return <>{out}</>;
}

/** How far a row slides to show both actions behind it: two 76px targets. */
const SWIPE_REVEAL = 152;
/** Below this the gesture is a tap or a scroll, not a swipe. */
const SWIPE_THRESHOLD = 36;

/**
 * One phone card, with Retire and Delete behind a leftward swipe.
 *
 * The swipe is an enhancement, never the only way: the same actions are on the ··· menu above, which is what
 * a keyboard, a screen reader and a mouse use. A row being saved does not swipe, so a half-finished action
 * cannot be started twice.
 */
function SwipeRow({ service, actions, t }: { service: ServiceAdmin; actions: RowActions; t: T }) {
  const [open, setOpen] = useState(false);
  const startX = useRef<number | null>(null);
  const busy = actions.busyId === service.id;

  const onTouchStart = (e: React.TouchEvent) => {
    if (busy) return;
    startX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? startX.current) - startX.current;
    startX.current = null;
    if (dx < -SWIPE_THRESHOLD) setOpen(true);
    else if (dx > SWIPE_THRESHOLD) setOpen(false);
  };

  return (
    <div className={`svc-swipe ${open ? 'is-open' : ''}`}>
      <div
        className="svc-swipe-face"
        style={open ? { transform: `translateX(-${SWIPE_REVEAL}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => open && setOpen(false)}
      >
        <NameCell service={service} t={t} />
        <span className="svc-card-right">
          <span className="svc-price">{formatMoney(service.priceMinor, service.currency)}</span>
          <span className="svc-time muted">{time(service, t)}</span>
        </span>
        <ServiceRowMenu service={service} actions={actions} t={t} />
      </div>
      {/* `aria-hidden`, because the ··· menu already offers these to anyone not using a thumb. */}
      <div className="svc-swipe-actions" aria-hidden="true">
        {service.active ? (
          <button type="button" className="svc-swipe-retire" tabIndex={-1} disabled={busy} onClick={() => actions.onRetire(service)}>
            {t('retire')}
          </button>
        ) : (
          <button type="button" className="svc-swipe-retire" tabIndex={-1} disabled={busy} onClick={() => actions.onRestore(service)}>
            {t('restore')}
          </button>
        )}
        <button type="button" className="svc-swipe-delete" tabIndex={-1} disabled={busy} onClick={() => actions.onDelete(service)}>
          {t('delete')}
        </button>
      </div>
    </div>
  );
}

/** The phone's list: one inset card per category, iOS-style, with the heading above it. */
export function ServiceCards({ rows, actions, t, order }: { rows: ServiceAdmin[]; actions: RowActions; t: T; order: CategoryOrder }) {
  const groups = groupByCategory(rows, order);
  const headings = worthGrouping(groups);

  return (
    <>
      {groups.map((group) => (
        <div className="svc-group" key={group.name ?? 'none'}>
          {headings && <div className="svc-group-label">{group.name ?? t('unfiled')}</div>}
          <div className="svc-group-card">
            {group.items.map((s) => (
              <SwipeRow key={s.id} service={s} actions={actions} t={t} />
            ))}
          </div>
        </div>
      ))}
      <p className="svc-swipe-hint">{t('swipeHint')}</p>
    </>
  );
}
