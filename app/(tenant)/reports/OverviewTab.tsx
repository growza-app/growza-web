'use client';

import { rangeName } from './shared';
import { useLocale, useTranslations } from 'next-intl';
import { chartBucketLabel } from '../lib/format';
import { useReportsCopy } from '../lib/use-reports-copy';
import { formatMoney, type ReportOverview } from '../lib/api';
import { IconAlert } from '../components/icons';
import { BarList, LineChart } from './charts';
import { Scorecard } from './Scorecard';

const SEGMENT_TONE: Record<string, string> = {
  active: 'var(--rp-brand)',
  due: 'var(--rp-amber)',
  at_risk: 'var(--rp-red)',
  inactive: 'var(--rp-purple)',
};

function money(minor: number): string {
  return formatMoney(String(minor));
}

/**
 * Overview — the tab an owner lands on, and a summary of the other seven
 * rather than a subject of its own. Every block here has somewhere to go next.
 */
export function OverviewTab({
  data,
  onTab,
}: {
  data: ReportOverview;
  onTab: (tab: string) => void;
}) {
  const rp = useReportsCopy();
  const t = useTranslations('reports');
  // Jira GRW-363 — a band's days in the owner's language, the same words the Clients page uses.
  const bands = useTranslations('customers');
  const locale = useLocale();
  // Jira GRW-478 (U-3) — dates in the owner's language, not the API's English.
  const labels = data.range.buckets.map((b) => chartBucketLabel(b.startISO, data.range.bucketUnit, locale, b.label));
  const { kpis } = data;
  const empty = data.kpis.bookings.value === 0 && data.kpis.revenueMinor.value === 0;

  return (
    <div className="rp-stack">
      {/* Jira GRW-567 — five sentences with a dot, where four tiles with a
          sparkline and a "+18% ↑" used to be. The tiles asked the owner to
          read; the scorecard tells them. Charts stay below for whoever wants
          them. */}
      <Scorecard data={data.scorecard} />

      <div className="rp-grid-2">
        <section className="rp-card">
          <div className="rp-card-head">
            <div>
              <h2>{rp.revenueTrend}</h2>
              <p>{rangeName(data.range, rp.ranges)}</p>
            </div>
            <div className="rp-card-figure">{money(kpis.revenueMinor.value)}</div>
          </div>
          {empty ? (
            <p className="rp-empty">{rp.noDataHint(rangeName(data.range, rp.ranges))}</p>
          ) : (
            <LineChart label={rp.revenueTrend} labels={labels} series={[{ color: 'var(--rp-brand)', values: data.revenueTrend.map((p) => p.value), format: money }]} fill />
          )}
        </section>

        <section className="rp-card">
          <div className="rp-card-head">
            <div>
              <h2>{rp.bookingTrend}</h2>
              <p>{rangeName(data.range, rp.ranges)}</p>
            </div>
            <div className="rp-card-figure">{kpis.bookings.value}</div>
          </div>
          {empty ? (
            <p className="rp-empty">{rp.noDataHint(rangeName(data.range, rp.ranges))}</p>
          ) : (
            <LineChart
              label={rp.bookingTrend}
              labels={labels}
              series={[{ color: 'var(--rp-blue)', values: data.bookingTrend.map((p) => p.value), format: rp.bookingsCount }]}
              fill
            />
          )}
        </section>
      </div>

      <div className="rp-grid-health">
        <section className="rp-card">
          <h2>{rp.segmentsTitle}</h2>
          <p className="rp-card-sub">{rp.segmentsHint(data.totalCustomers)}</p>
          <div className="rp-segments">
            {data.segments.map((segment) => (
              <button
                key={segment.key}
                type="button"
                className="rp-segment"
                style={{ ['--rp-seg' as string]: SEGMENT_TONE[segment.key] }}
                onClick={() => onTab('customers')}
              >
                <span className="rp-segment-label">
                  <span className="rp-segment-dot" />
                  {rp.segments[segment.key]}
                </span>
                <span className="rp-segment-count">{segment.count}</span>
                <span className="rp-segment-range">{bands(`segments.${segment.key}.range`)}</span>
              </button>
            ))}
          </div>
          {/* Stated rather than left as an unexplained gap: these customers are
              in the total above and in none of the four buckets, so without
              this line the numbers look like they do not add up. */}
          {data.neverVisited > 0 && <p className="rp-card-foot">{rp.neverVisited(data.neverVisited)}</p>}
        </section>

        <section className="rp-card">
          <h2>{rp.topServices}</h2>
          <p className="rp-card-sub">{rangeName(data.range, rp.ranges)}</p>
          <BarList
            emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))}
            items={data.topServices.map((s) => ({
              label: s.label,
              value: s.value,
              display: money(s.value),
              note: s.retired ? t('retiredNote') : undefined,
            }))}
          />
        </section>
      </div>

      {/* "Worth a call this week" used to sit here, as a list with no button.
          Since Jira GRW-566 it is the "due back" card of What to do, where
          every name has WhatsApp and Call beside it. */}
      {empty && (
        <section className="rp-card rp-card-quiet">
          <span className="rp-card-icon rp-muted">
            <IconAlert />
          </span>
          <div>
            <h2>{rp.noData}</h2>
            <p className="rp-card-sub">{rp.noDataHint(rangeName(data.range, rp.ranges))}</p>
          </div>
        </section>
      )}
    </div>
  );
}
