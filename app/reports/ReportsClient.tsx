'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { copy } from '../lib/copy';
import type { ReportOverview, ReportRangeKey, ReportTabKey } from '../lib/api';
import { OverviewTab } from './OverviewTab';
import { ReportsShell } from './ReportsShell';

/**
 * Ties the chrome to the active tab.
 *
 * Data arrives already fetched from the server component — this layer only
 * decides what to render and how navigation between tabs works, so no metric
 * is ever computed in the browser (07-product-surfaces.md §3.3).
 */
export function ReportsClient({
  tab,
  range,
  compare,
  staffTabAvailable,
  overview,
}: {
  tab: ReportTabKey;
  range: ReportRangeKey;
  compare: boolean;
  staffTabAvailable: boolean;
  overview: ReportOverview | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const goToTab = (next: string) => {
    const query = new URLSearchParams(params.toString());
    query.set('tab', next);
    router.push(`/reports?${query.toString()}`);
  };

  return (
    <ReportsShell tab={tab} range={range} compare={compare} staffTabAvailable={staffTabAvailable}>
      {tab === 'overview' && overview ? (
        <OverviewTab data={overview} onTab={goToTab} />
      ) : tab === 'overview' ? (
        <p className="rp-empty">{copy.reports.loadFailed}</p>
      ) : (
        // Every other tab has its own story. Until it lands the tab says so,
        // rather than showing a blank panel or a spinner that never resolves
        // (GRW-50 AC-04).
        <section className="rp-card rp-card-quiet">
          <div>
            <h2>{copy.reports.tabs[tab]}</h2>
            <p className="rp-card-sub">{copy.reports.comingSoonTab}</p>
          </div>
        </section>
      )}
    </ReportsShell>
  );
}
