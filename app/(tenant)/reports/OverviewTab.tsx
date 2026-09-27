'use client';

import { rangeName } from './shared';
import { useTranslations } from 'next-intl';
import { useReportsCopy } from '../lib/use-reports-copy';
import { InfoTip } from '../components/InfoTip';
import { formatMoney, type ReportOverview } from '../lib/api';
import {
  IconAlert,
  IconArrowRight,
  IconFlame,
  IconRepeat,
  IconReports,
  IconRupee,
  IconUserPlus,
} from '../components/icons';
import { BarList, LineChart } from './charts';
import { Kpi } from './Kpi';

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
  onClient,
}: {
  data: ReportOverview;
  onTab: (tab: string) => void;
  onClient: (id: string) => void;
}) {
  const rp = useReportsCopy();
  const t = useTranslations('reports');
  // Jira GRW-363 — a band's days in the owner's language, the same words the Clients page uses.
  const bands = useTranslations('customers');
  const labels = data.range.buckets.map((b) => b.label);
  const { kpis, sparklines } = data;
  const empty = data.kpis.bookings.value === 0 && data.kpis.revenueMinor.value === 0;

  return (
    <div className="rp-stack">
      {/* Four figures, not six. "Finished" restated Bookings and "Average
          booking" restated the Money tab — a row where tile 3 is tile 1 with
          a bit taken off reads as numbers contradicting each other, which is
          the row conventions §6 retired once already. What is left is the
          four questions an owner actually opens this screen with: how much
          came in, how many visits, are new people arriving, are they coming
          back. */}
      <div className="rp-kpi-grid rp-kpi-grid-4">
        <Kpi
          icon={<IconRupee />}
          iconTone="var(--rp-green-ink)"
          label={rp.kpi.revenue}
          explain={rp.explain.overviewRevenue}
          value={money(kpis.revenueMinor.value)}
          metric={kpis.revenueMinor}
          compare={data.compare}
          spark={sparklines.revenueMinor}
          sparkLabels={labels}
          sparkFormat={money}
        />
        <Kpi
          icon={<IconReports />}
          iconTone="var(--rp-blue)"
          label={rp.kpi.bookings}
          explain={rp.explain.overviewBookings}
          value={String(kpis.bookings.value)}
          metric={kpis.bookings}
          compare={data.compare}
          spark={sparklines.bookings}
          sparkLabels={labels}
        />
        <Kpi
          icon={<IconUserPlus />}
          iconTone="var(--rp-purple)"
          label={rp.kpi.newCustomers}
          explain={rp.explain.overviewNewClients}
          value={String(kpis.newCustomers.value)}
          metric={kpis.newCustomers}
          compare={data.compare}
          spark={sparklines.newCustomers}
          sparkLabels={labels}
        />
        <Kpi
          icon={<IconRepeat />}
          iconTone="var(--rp-brand)"
          label={rp.kpi.repeatRate}
          explain={rp.explain.overviewRepeat}
          value={`${kpis.repeatRatePct.value}%`}
          metric={kpis.repeatRatePct}
          compare={data.compare}
          spark={sparklines.repeatRatePct}
          sparkLabels={labels}
          // Named, because this line counts returning clients while the figure
          // above it is a share — they move together but are not the same
          // number, and an unlabelled line would be read as the percentage.
          sparkName={t('rows.returning')}
        />
      </div>

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

      {/* The weekday × hour grid used to sit here too, showing the exact same
          data as the one on Bookings — same query, same grid, two titles. One
          of them had to go, and it is the one on the summary: "when do my
          hours fill up" is a question about demand, which is what the Bookings
          tab is for. */}
      <section className="rp-card">
        <div className="rp-card-head">
          <div>
            <h2>
              {rp.opportunities}
              <InfoTip label={rp.opportunities}>{rp.explain.opportunities}</InfoTip>
            </h2>
            <p>{rp.opportunitiesHint}</p>
          </div>
          <span className="rp-card-icon rp-amber-ink">
            <IconFlame />
          </span>
        </div>
        {data.opportunities.length === 0 ? (
          <p className="rp-empty">{rp.notEnoughVisits}</p>
        ) : (
          <div className="rp-opps">
            {data.opportunities.map((o) => {
              const late = (o.daysOverdue ?? 0) > 0;
              return (
                <button
                  key={o.customerId}
                  type="button"
                  className="rp-opp"
                  onClick={() => onClient(o.customerId)}
                >
                  <span className="rp-avatar">{o.initial}</span>
                  <span className="rp-opp-main">
                    <span className="rp-opp-name">{o.name}</span>
                    <span className="rp-opp-meta">
                      {o.intervalDays ? rp.usuallyEvery(o.intervalDays) : ''}
                    </span>
                  </span>
                  <span className="rp-opp-right">
                    {/* What one recovered visit is worth, which is what the
                        list is ordered by. It showed lifetime spend before —
                        the number that made a ₹462 client look like a reason
                        to pick up the phone. */}
                    <span className="rp-opp-spend">{rp.perVisit(money(o.avgTicketMinor))}</span>
                    <span className="rp-opp-status" style={{ color: late ? 'var(--rp-red)' : 'var(--rp-amber)' }}>
                      {o.daysOverdue === null
                        ? ''
                        : o.daysOverdue > 0
                          ? rp.overdueBy(o.daysOverdue)
                          : o.daysOverdue === 0
                            ? rp.dueNow
                            : rp.dueIn(-o.daysOverdue)}
                    </span>
                  </span>
                  <span className="rp-opp-chev">
                    <IconArrowRight />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

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
