'use client';

import { useReportsCopy } from '../lib/use-reports-copy';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { pickNoun } from '../lib/nouns';
import { useState, type ReactNode } from 'react';

import { HeaderControls } from '../components/HeaderControls';
import { HeaderBranchPicker } from '../components/HeaderBranchPicker';
import { BackButton } from '../components/BackButton';
import {
  countFilters,
  isFilterableReportTab,
  type ReportFilterOptions,
  type ReportFilters,
  type ReportRangeKey,
  type ReportTabKey,
} from '../lib/api';
import { FiltersDrawer } from './FiltersDrawer';
import { IconCalendar, IconChevronDown, IconDownload, IconFilter, IconRepeat } from '../components/icons';

const TAB_ORDER: ReportTabKey[] = [
  'overview',
  'customers',
  'revenue',
  'bookings',
  'services',
  'staff',
];

const RANGE_ORDER: ReportRangeKey[] = [
  'today',
  'last_7_days',
  'this_month',
  'last_month',
  'last_3_months',
  'this_year',
];

/**
 * The chrome above every Reports tab: title, the question the tab answers,
 * range picker, comparison toggle, and the tab bar.
 *
 * Tab and range live in the URL rather than in component state, so a report an
 * owner is looking at is a link they can send, a bookmark that still works,
 * and a back button that goes where they expect. It also means every tab is
 * server-rendered from one place instead of eight client fetchers that could
 * each resolve "this month" slightly differently.
 */
export function ReportsShell({
  tab,
  range,
  compare,
  staffTabAvailable,
  allowedTabs,
  filters,
  filterOptions,
  droppedFilters,
  providerLabel,
  onExport,
  canExport,
  labels,
  rangeLabel,
  children,
}: {
  tab: ReportTabKey;
  range: ReportRangeKey;
  compare: boolean;
  /**
   * What the range actually resolved to, from the payload. Only a custom
   * range needs it: every other key has a fixed name, but "Pick dates" on the
   * button while January's figures are on screen is the header describing a
   * different period from the one below it.
   */
  rangeLabel?: string;
  /** Off for verticals where ranking providers is a product smell (07 §3.2). */
  staffTabAvailable: boolean;
  /** GRW-197 — report tabs this caller may open. */
  allowedTabs: readonly string[];
  filters: ReportFilters;
  filterOptions: ReportFilterOptions;
  droppedFilters: number;
  providerLabel: string;
  /** Builds and downloads the active tab's CSV. Owned by the client, which holds the payload. */
  onExport: () => void;
  /** False when the tab has nothing to write — a button that downloads an empty file is worse than a disabled one. */
  canExport: boolean;
  /** The vertical's own nouns — "Stylists" for a salon, "Doctors" for a clinic. */
  labels: Record<string, string>;
  children: ReactNode;
}) {
  const rp = useReportsCopy();
  const st = useTranslations('status');
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const go = (next: Record<string, string>) => {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) query.set(key, value);
    router.push(`/reports?${query.toString()}`);
  };

  // Two independent gates: the vertical decides whether a staff leaderboard
  // exists at all, the salon decides who may look at it (GRW-197).
  const tabs = TAB_ORDER.filter((key) => allowedTabs.includes(key) && (key !== 'staff' || staffTabAvailable));

  const filterable = isFilterableReportTab(tab);
  const activeFilters = countFilters(filters);

  /**
   * Filters live in the URL like the tab and range do, so a narrowed report is
   * a link somebody can send and the back button undoes a filter (FR-03).
   */
  const applyFilters = (next: ReportFilters) => {
    const query = new URLSearchParams(params.toString());
    query.delete('providerId');
    query.delete('serviceId');
    query.delete('status');
    for (const id of next.providerIds) query.append('providerId', id);
    for (const id of next.serviceIds) query.append('serviceId', id);
    for (const s of next.statuses) query.append('status', s);
    setFiltersOpen(false);
    router.push(`/reports?${query.toString()}`);
  };

  const removeFilter = (group: keyof ReportFilters, value: string) =>
    applyFilters({ ...filters, [group]: filters[group].filter((v) => v !== value) });

  /** Names for the applied-filter chips, resolved from what the drawer offered. */
  const nameOf = (group: keyof ReportFilters, id: string) => {
    if (group === 'providerIds') return filterOptions.providers.find((p) => p.id === id)?.name ?? id;
    if (group === 'serviceIds') return filterOptions.services.find((s) => s.id === id)?.name ?? id;
    return st(id === 'no_show' ? 'didNotCome' : id === 'completed' ? 'done' : (id as 'confirmed' | 'cancelled'));
  };

  // Two of these are domain nouns, not UI chrome, so they come from the
  // vertical's label pack exactly as the sidebar's do. Hardcoding "Clients"
  // here while the sidebar renders "Patients" from config is the drift
  // ctx.labels exists to prevent (01 §4, epic BR-06).
  //
  // Jira GRW-363 — in another language the vertical's English noun ("Staff", "Clients") gives
  // way to the tab's own word until the verticals carry one per language (GRW-315 story 5).
  const tabLabel = (key: ReportTabKey) =>
    key === 'customers' ? pickNoun(locale, labels.customers ?? rp.tabs.customers, rp.tabs.customers)
    : key === 'staff' ? pickNoun(locale, labels.providers ?? rp.tabs.staff, rp.tabs.staff)
    : rp.tabs[key];

  // A fragment, not a wrapper: `.content` is a three-row grid (header /
  // scroller / footer), so the header and the scrolling body have to be its
  // direct children. Wrapping them would put the whole page in the header row
  // and nothing would scroll (GRW-5's shell grid).
  return (
    <>
      {/* Jira GRW-377 — the branch chosen on any other screen is the branch Reports opens on. */}
      <BranchUrlSync />
      <header className="rp-header">
        <div className="rp-title-row">
          <div className="topbar-lead">
            <BackButton phoneOnly />
            <div className="topbar-title">
              <h1>{rp.title}</h1>
              <p>{rp.subtitles[tab]}</p>
              {/* Jira GRW-395 — Reports draws its own header, and on a phone had no branch at all (QA). */}
              <HeaderBranchPicker variant="line" />
            </div>
          </div>
          {/*
            Jira GRW-30 — this row was a flex container with one child in it.

            Reports had no search, no notification bell and no account menu:
            the screen the owner named as one of the three things they are
            buying the product for was the one screen you could not sign out
            of. Not a styling gap — the controls were simply absent, and a
            header with nothing on its right looks finished.
          */}
          <div className="topbar-actions">
            <HeaderControls />
          </div>
        </div>

        <div className="rp-controls">
          <div className="rp-range">
            <button type="button" className="rp-control" onClick={() => setRangeOpen((open) => !open)}>
              <span className="rp-control-icon rp-brand-ink">
                <IconCalendar />
              </span>
              <span>{rangeLabel ?? rp.ranges[range]}</span>
              <span className="rp-control-icon rp-muted">
                <IconChevronDown />
              </span>
            </button>
            {rangeOpen && (
              <>
                <button
                  type="button"
                  className="rp-range-scrim"
                  aria-label={rp.filterDrawer.close}
                  onClick={() => setRangeOpen(false)}
                />
                <div className="rp-range-menu">
                  {RANGE_ORDER.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={key === range ? 'active' : ''}
                      onClick={() => {
                        setRangeOpen(false);
                        go({ range: key });
                      }}
                    >
                      {rp.ranges[key]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>


          <button
            type="button"
            className={`rp-control ${compare ? 'rp-control-on' : ''}`}
            onClick={() => go({ compare: String(!compare) })}
          >
            <span className="rp-control-icon">
              <IconRepeat />
            </span>
            <span>{rp.compare}</span>
          </button>

          <div className="rp-controls-spacer" />

          {/* Live on the tabs a filter can honestly narrow, and disabled with
              the reason on the rest — a control that looks alive and silently
              does nothing is the thing GRW-50's rule forbids. */}
          <button
            type="button"
            className={`rp-control${activeFilters > 0 ? ' is-on' : ''}`}
            disabled={!filterable}
            title={filterable ? undefined : rp.filtersNotHere}
            onClick={() => setFiltersOpen(true)}
          >
            <span className={`rp-control-icon${filterable ? '' : ' rp-muted'}`}>
              <IconFilter />
            </span>
            <span>{rp.filters}</span>
            {filterable && activeFilters > 0 && <span className="rp-control-count">{activeFilters}</span>}
          </button>
          <button
            type="button"
            className="rp-control rp-control-primary"
            onClick={onExport}
            disabled={!canExport}
            title={canExport ? undefined : rp.exportNothing}
          >
            <span className="rp-control-icon">
              <IconDownload />
            </span>
            <span>{rp.export}</span>
          </button>
        </div>

        <nav className="rp-tabs">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              className={key === tab ? 'active' : ''}
              onClick={() => go({ tab: key })}
            >
              {tabLabel(key)}
            </button>
          ))}
        </nav>
      </header>

      <div className="rp-body page-body">
        {/* What is narrowing this tab, and how to stop it — one click per
            filter, so removing one does not mean reopening the drawer
            (FR-04). */}
        {filterable && activeFilters > 0 && (
          <div className="rp-applied">
            <span className="rp-applied-label">{rp.applied}</span>
            {(['providerIds', 'serviceIds', 'statuses'] as const).flatMap((group) =>
              filters[group].map((value) => (
                <button
                  key={`${group}:${value}`}
                  type="button"
                  className="rp-applied-chip"
                  onClick={() => removeFilter(group, value)}
                  aria-label={rp.remove(nameOf(group, value))}
                >
                  {nameOf(group, value)}
                  <span aria-hidden="true">✕</span>
                </button>
              )),
            )}
            <button
              type="button"
              className="rp-applied-clear"
              onClick={() => applyFilters({ providerIds: [], serviceIds: [], statuses: [] })}
            >
              {rp.clearFilters}
            </button>
          </div>
        )}

        {/* A filter set on another tab is still in the URL here. Saying so
            beats letting the owner read unnarrowed figures believing they are
            narrowed. */}
        {!filterable && activeFilters > 0 && (
          <div className="rp-applied rp-applied-inert">
            <span>{rp.filtersOnOtherTabs(activeFilters)}</span>
          </div>
        )}

        {droppedFilters > 0 && (
          <div className="rp-applied rp-applied-inert">
            <span>{rp.droppedFilters(droppedFilters)}</span>
          </div>
        )}

        {children}
      </div>

      <FiltersDrawer
        open={filtersOpen}
        filters={filters}
        options={filterOptions}
        providerLabel={providerLabel}
        onClose={() => setFiltersOpen(false)}
        onApply={applyFilters}
      />
    </>
  );
}
