'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { copy } from '../lib/copy';
import type {
  ReportBookings,
  ReportCustomers,
  ReportInsights,
  ReportOverview,
  ReportRangeKey,
  ReportRevenue,
  ReportServices,
  ReportStaff,
  ReportTabKey,
} from '../lib/api';
import { ClientProfileCard } from '../components/ClientProfileCard';
import { BookingsTab } from './BookingsTab';
import { CustomersTab } from './CustomersTab';
import { InsightsTab } from './InsightsTab';
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
  | { tab: 'insights'; data: ReportInsights }
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
  providerLabel,
  labels,
  payload,
}: {
  tab: ReportTabKey;
  range: ReportRangeKey;
  compare: boolean;
  staffTabAvailable: boolean;
  providerLabel: string;
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

  // Segment cards lead to the Clients page filtered to that segment — the
  // same four words, the same boundaries, the same rows (conventions §5).
  const goToSegment = (segment: string) => router.push(`/customers?status=${segment}`);

  return (
    <ReportsShell
      tab={tab}
      range={range}
      compare={compare}
      staffTabAvailable={staffTabAvailable}
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
        <CustomersTab data={payload.data} onSegment={goToSegment} onClient={setOpenClientId} />
      ) : (
        <InsightsTab data={payload.data} onTab={goToTab} />
      )}
      {openClientId && <ClientProfileCard clientId={openClientId} onClose={() => setOpenClientId(null)} />}
    </ReportsShell>
  );
}
