'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { copy } from '../lib/copy';
import type {
  ReportFilterOptions,
  ReportFilters,
  ReportBookings,
  ReportCustomers,
  ReportOverview,
  ReportRangeKey,
  ReportRevenue,
  ReportServices,
  ReportStaff,
  ReportTabKey,
} from '../lib/api';
import { ClientProfileCard } from '../components/ClientProfileCard';
import { csvFilename, downloadCsv, reportToCsv } from './export';
import { BookingsTab } from './BookingsTab';
import { CustomersTab } from './CustomersTab';
import { OverviewTab } from './OverviewTab';
import { ReportsShell } from './ReportsShell';
import { RevenueTab } from './RevenueTab';
import { ServicesTab } from './ServicesTab';
import { StaffTab } from './StaffTab';

/**
 * A tab and its data as one value, so the two cannot get out of step — a
 * `tab` prop saying "revenue" beside a payload that is actually the Bookings
 * envelope is a class of bug the type system should refuse outright.
 */
export type TabPayload =
  | { tab: 'overview'; data: ReportOverview }
  | { tab: 'revenue'; data: ReportRevenue }
  | { tab: 'bookings'; data: ReportBookings }
  | { tab: 'services'; data: ReportServices }
  | { tab: 'staff'; data: ReportStaff }
  | { tab: 'customers'; data: ReportCustomers }
  | null;

/**
 * Ties the chrome to the active tab.
 *
 * Data arrives already resolved from the server component; this layer only
 * decides what to render and how navigation works, so no metric is ever
 * computed in the browser (07-product-surfaces.md §3.3).
 */
export function ReportsClient({
  tab,
  range,
  compare,
  staffTabAvailable,
  allowedTabs,
  filters,
  filterOptions,
  droppedFilters,
  providerLabel,
  tenantName,
  rangeLabel,
  labels,
  payload,
}: {
  tab: ReportTabKey;
  range: ReportRangeKey;
  compare: boolean;
  staffTabAvailable: boolean;
  /** GRW-197 — report tabs this caller may open. */
  allowedTabs: readonly string[];
  /** Already narrowed to ids this tenant owns — see page.tsx. */
  filters: ReportFilters;
  filterOptions: ReportFilterOptions;
  /** How many URL filters pointed at something that no longer exists. */
  droppedFilters: number;
  providerLabel: string;
  /** For the download's filename, which names the tenant, tab and range (FR-05). */
  tenantName: string;
  rangeLabel: string;
  labels: Record<string, string>;
  payload: TabPayload;
}) {
  const router = useRouter();
  const params = useSearchParams();
  // Which client's card is open. A row opens it over the report rather than
  // navigating, so the owner keeps their place in the list they were reading.
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  const goToTab = (next: string) => {
    const query = new URLSearchParams(params.toString());
    query.set('tab', next);
    router.push(`/reports?${query.toString()}`);
  };

  // A band leads to the Clients page filtered to it — the same four words,
  // the same boundaries, the same rows (conventions §5). Reports counts them;
  // the Clients page is where you work through them.
  const goToSegment = (segment: string) =>
    router.push(segment === 'all' ? '/customers' : `/customers?status=${segment}`);

  /**
   * The download, built from `payload` — the very object the tab below is
   * rendering. Not a second fetch, so the file cannot disagree with the
   * screen however the tab changes later (AC-04).
   */
  const csv = reportToCsv(payload, providerLabel);
  const onExport = () =>
    downloadCsv(csvFilename(tenantName, tab, rangeLabel), csv);

  return (
    <ReportsShell
      tab={tab}
      range={range}
      compare={compare}
      staffTabAvailable={staffTabAvailable}
      allowedTabs={allowedTabs}
      filters={filters}
      filterOptions={filterOptions}
      droppedFilters={droppedFilters}
      providerLabel={providerLabel}
      onExport={onExport}
      canExport={csv.trim().length > 0}
      labels={labels}
      rangeLabel={range === 'custom' ? payload?.data.range.label : undefined}
    >
      {payload === null ? (
        <section className="rp-card rp-card-quiet">
          <div>
            <h2>{copy.reports.loadFailed}</h2>
            <p className="rp-card-sub">{copy.errors.apiDownHelp} <code>npm run dev</code>.</p>
          </div>
        </section>
      ) : payload.tab === 'overview' ? (
        <OverviewTab data={payload.data} onTab={goToTab} onClient={setOpenClientId} />
      ) : payload.tab === 'revenue' ? (
        <RevenueTab data={payload.data} />
      ) : payload.tab === 'bookings' ? (
        <BookingsTab data={payload.data} />
      ) : payload.tab === 'services' ? (
        <ServicesTab data={payload.data} />
      ) : payload.tab === 'staff' ? (
        <StaffTab data={payload.data} providerLabel={providerLabel} />
      ) : payload.tab === 'customers' ? (
        <CustomersTab
          data={payload.data}
          status={params.get('status') ?? 'all'}
          onSegment={goToSegment}
          onClient={setOpenClientId}
        />
      ) : null}
      {openClientId && <ClientProfileCard clientId={openClientId} onClose={() => setOpenClientId(null)} />}
    </ReportsShell>
  );
}
