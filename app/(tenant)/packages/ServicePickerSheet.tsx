'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatMoney, type Service } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';
import { asMinor, matchItems, MIN_CHARS } from '../lib/service-match';
import { extraSuggestions } from '../lib/service-suggest';
import { useServiceSuggestions } from '../lib/useServiceSuggestions';
import { ServicePhoto } from '../components/ServicePhoto';
import { DeskServiceGrid } from '../appointments/new/DeskServiceGrid';

/**
 * Picking the services a package is made of, in a sheet of its own.
 *
 * It used to live inline in the builder's first step: a search box, a results list that opened under it, a row of
 * meaning-based extras and the picked list, all stacked inside a form that also held the name and the price. At
 * 344px that was four screens, and the fix kept being to make each piece smaller — a 112px list scrolling inside a
 * page that also scrolled. Choosing from a long list is its own task, so it gets its own surface: the whole catalogue
 * is browsable without typing a word, a tap adds or removes, and the form behind it only ever shows the answer.
 *
 * Picks commit as they are made, so Done is a way out and not a commit — there is nothing here to lose by closing it.
 */
export function ServicePickerSheet({
  services,
  selectedIds,
  branchId,
  onToggle,
  onClose,
}: {
  services: Service[];
  selectedIds: string[];
  branchId: string | null;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('packages.builder');
  const tm = useTranslations('services');
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose });
  const [search, setSearch] = useState('');
  /*
   * Owner, 2026-10-14 — on a desk (≥1101px) the picker is the till's grid: categories, search and big tiles
   * (`DeskServiceGrid`), a picked tile ticked, a tap toggling it. One way of choosing a service on a desk,
   * whether it is going on a bill or into a package. Null until the width is known; the list draws then.
   */
  const [desk, setDesk] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1101px)');
    const apply = () => setDesk(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Jira GRW-375 — the same matching as the walk-in sheet and the services table.
  const rows =
    search.trim().length < MIN_CHARS
      ? services
      : matchItems(
          services.map((s) => ({ item: s, text: [s.name], priceMinor: asMinor(s.priceMinor) })),
          search,
        );

  /**
   * Jira GRW-449 — the other half of that search: what the typed words MEAN. Resolved through the whole catalogue
   * rather than the unpicked part of it, because a picked service shows its tick here instead of disappearing.
   */
  const remote = useServiceSuggestions(search, branchId);
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const alsoTry = useMemo(
    () => extraSuggestions(rows, remote, search, (id) => serviceById.get(id)),
    [rows, remote, search, serviceById],
  );

  const head = (
    <div className="sheet-head">
      <span className="svc-picker-count">
        {selectedIds.length > 0 ? t('picker.chosen', { count: selectedIds.length }) : ''}
      </span>
      <span className="sheet-head-title">{t('picker.title')}</span>
      <button type="button" className="sheet-head-save" onClick={onClose}>
        {t('picker.done')}
      </button>
    </div>
  );

  if (desk) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal sheet svc-picker svc-picker-desk pf-wide"
          role="dialog"
          aria-modal="true"
          aria-label={t('picker.title')}
          ref={sheetRef}
          onClick={(e) => e.stopPropagation()}
        >
          {head}
          {/* A package holds a service once: the tile's tap toggles it, and the till's − n + is not drawn (79-desk-package.css). */}
          <DeskServiceGrid
            services={services}
            countOf={(id) => (selectedIds.includes(id) ? 1 : 0)}
            onMore={(s) => onToggle(s.id)}
            onLess={(id) => onToggle(id)}
            full={false}
            money={(minor) => formatMoney(String(minor))}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal sheet svc-picker"
        role="dialog"
        aria-modal="true"
        aria-label={t('picker.title')}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
      >
        {head}

        <div className="svc-picker-search picker-search">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchServices', { count: services.length })}
            style={{ paddingRight: search ? 36 : undefined }}
          />
          {search !== '' && (
            <button type="button" className="search-clear-btn" onClick={() => setSearch('')} aria-label={t('clearSearch')}>
              ✕
            </button>
          )}
        </div>

        <div className="sheet-body svc-picker-body">
          {/* Shown above the list and never mixed into it: a neighbour is not a match, and what was typed for keeps its order. */}
          {alsoTry.length > 0 && (
            <div className="also-try">
              <span className="also-try-label">{t('alsoTry')}</span>
              <div className="also-try-chips">
                {alsoTry.map((s) => (
                  <button key={s.id} type="button" className="also-try-chip" onClick={() => setSearch(s.name)}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="sheet-foot">{t('noMatch')}</div>
          ) : (
            <div className="sheet-group">
              {rows.map((s) => {
                const picked = selectedIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`svc-pick-row ${picked ? 'is-picked' : ''}`}
                    aria-pressed={picked}
                    onClick={() => onToggle(s.id)}
                  >
                    { }
                    <ServicePhoto className="picker-row-thumb" service={s} size={36} />
                    <span className="svc-pick-main">
                      <span className="picker-row-name">{s.name}</span>
                      <span className="picker-row-meta">{tm('minutes', { count: s.durationMin })}</span>
                    </span>
                    <span className="picker-row-price">{formatMoney(s.priceMinor)}</span>
                    {/* The tick is not the only thing saying it — the row carries `aria-pressed` for a screen reader. */}
                    <span className="svc-pick-check" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
