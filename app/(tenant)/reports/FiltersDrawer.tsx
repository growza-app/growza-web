'use client';

import { useEffect, useRef, useState } from 'react';

import { copy } from '../lib/copy';
import { countFilters, type ReportFilterOptions, type ReportFilters } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * The Filters drawer (GRW-60).
 *
 * Three groups, not the mock's five. "Customer type" duplicates the segment
 * cards, which already filter through to the Clients page, and "Payment
 * method" would narrow a booking-count chart by a field only completed
 * bookings carry — a filter that quietly changes what a chart is counting is
 * worse than no filter at all.
 *
 * Selections are staged inside the drawer and committed on Apply, so the
 * report is not refetched on every chip tap. Cancelling or closing discards
 * them, which is what makes Apply mean something.
 */
export function FiltersDrawer({
  open,
  filters,
  options,
  providerLabel,
  onClose,
  onApply,
}: {
  open: boolean;
  filters: ReportFilters;
  options: ReportFilterOptions;
  /** The vertical's own noun — "Stylists" for a salon, "Doctors" for a clinic. */
  providerLabel: string;
  onClose: () => void;
  onApply: (next: ReportFilters) => void;
}) {
  const [draft, setDraft] = useState<ReportFilters>(filters);
  const panel = useRef<HTMLDivElement>(null);

  // Reopening shows what is actually applied, not what was abandoned last time.
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  // Escape closes, Tab stays inside, and focus goes back to the button that opened it (Jira GRW-342).
  useDialog(panel, { onClose, active: open });

  if (!open) return null;

  const toggle = (group: keyof ReportFilters, value: string) =>
    setDraft((d) => ({
      ...d,
      [group]: d[group].includes(value) ? d[group].filter((v) => v !== value) : [...d[group], value],
    }));

  const c = copy.reports.filterDrawer;
  const staged = countFilters(draft);

  const group = (
    key: keyof ReportFilters,
    title: string,
    items: { id: string; name: string; retired?: boolean }[],
    emptyNote: string,
  ) => (
    <section className="rp-fd-group">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="rp-fd-none">{emptyNote}</p>
      ) : (
        <div className="rp-fd-chips">
          {items.map((item) => {
            const on = draft[key].includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`rp-fd-chip${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(key, item.id)}
              >
                {item.name}
                {/* A report over last quarter has to be narrowable to someone
                    who has since left, or the filter cannot describe the
                    period it is filtering (conventions §2). */}
                {item.retired && <span className="rp-fd-retired">{c.retired}</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <>
      <button type="button" className="rp-fd-scrim" aria-label={c.close} onClick={onClose} />
      <div className="rp-fd" role="dialog" aria-modal="true" aria-label={c.title} ref={panel}>
        <header className="rp-fd-head">
          <h2>{c.title}</h2>
          <button type="button" className="rp-fd-close" onClick={onClose} aria-label={c.close}>
            ✕
          </button>
        </header>

        <div className="rp-fd-body">
          {group('providerIds', providerLabel, options.providers, c.noProviders)}
          {group('serviceIds', c.services, options.services, c.noServices)}
          {group(
            'statuses',
            c.status,
            (['confirmed', 'completed', 'no_show', 'cancelled'] as const).map((s) => ({
              id: s,
              // One status vocabulary across the product: a chip here reads
              // exactly as the chip on a booking does (conventions §3).
              name: copy.status[s === 'no_show' ? 'didNotCome' : s === 'completed' ? 'done' : s],
            })),
            '',
          )}
        </div>

        {/* Pinned, so the primary action is never below the fold however long
            a tenant's service list runs (GRW-024's rule). */}
        <footer className="rp-fd-foot">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setDraft({ providerIds: [], serviceIds: [], statuses: [] })}
            disabled={staged === 0}
          >
            {c.reset}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onApply(draft)}>
            {staged === 0 ? c.apply : c.applyCount(staged)}
          </button>
        </footer>
      </div>
    </>
  );
}
