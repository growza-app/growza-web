'use client';

import { copy } from '../lib/copy';
import { formatMoney, type ReportOverview } from '../lib/api';
import {
  IconAlert,
  IconArrowRight,
  IconCoins,
  IconFlame,
  IconRepeat,
  IconReports,
  IconRupee,
  IconUserCheck,
  IconUserPlus,
} from '../components/icons';
import { BarList, Heatmap, LineChart } from './charts';
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

/** "3h 20m" — an owner reads hours, not 200 minutes. */
function hoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Overview — the tab an owner lands on, and a summary of the other seven
 * rather than a subject of its own. Every block here has somewhere to go next.
 */
export function OverviewTab({ data, onTab }: { data: ReportOverview; onTab: (tab: string) => void }) {
  const labels = data.range.buckets.map((b) => b.label);
  const { kpis, sparklines } = data;
  const empty = data.kpis.bookings.value === 0 && data.kpis.revenueMinor.value === 0;

  return (
    <div className="rp-stack">
      <div className="rp-kpi-grid">
        <Kpi
          icon={<IconRupee />}
          iconTone="var(--rp-green-ink)"
          label={copy.reports.kpi.revenue}
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
          label={copy.reports.kpi.bookings}
          value={String(kpis.bookings.value)}
          metric={kpis.bookings}
          compare={data.compare}
          spark={sparklines.bookings}
          sparkLabels={labels}
        />
        <Kpi
          icon={<IconUserCheck />}
          iconTone="var(--rp-teal)"
          label={copy.reports.kpi.completed}
          value={String(kpis.completed.value)}
          metric={kpis.completed}
          compare={data.compare}
          spark={sparklines.completed}
          sparkLabels={labels}
        />
        <Kpi
          icon={<IconCoins />}
          iconTone="var(--rp-amber)"
          label={copy.reports.kpi.avgBookingValue}
          value={money(kpis.avgBookingValueMinor.value)}
          metric={kpis.avgBookingValueMinor}
          compare={data.compare}
          spark={sparklines.avgBookingValueMinor}
          sparkLabels={labels}
          sparkFormat={money}
        />
        <Kpi
          icon={<IconUserPlus />}
          iconTone="var(--rp-purple)"
          label={copy.reports.kpi.newCustomers}
          value={String(kpis.newCustomers.value)}
          metric={kpis.newCustomers}
          compare={data.compare}
          spark={sparklines.newCustomers}
          sparkLabels={labels}
        />
        <Kpi
          icon={<IconRepeat />}
          iconTone="var(--rp-brand)"
          label={copy.reports.kpi.repeatRate}
          value={`${kpis.repeatRatePct.value}%`}
          metric={kpis.repeatRatePct}
          compare={data.compare}
          spark={sparklines.repeatRatePct}
          sparkLabels={labels}
          // Named, because this line is a count of returning clients while the
          // figure above it is a rate — the two move together but are not the
          // same number, and an unlabelled line would be read as the rate.
          sparkName="Came back"
        />
      </div>

      <div className="rp-grid-2">
        <section className="rp-card">
          <div className="rp-card-head">
            <div>
              <h2>{copy.reports.revenueTrend}</h2>
              <p>{data.range.label}</p>
            </div>
            <div className="rp-card-figure">{money(kpis.revenueMinor.value)}</div>
          </div>
          {empty ? (
            <p className="rp-empty">{copy.reports.noDataHint(data.range.label)}</p>
          ) : (
            <LineChart labels={labels} series={[{ color: 'var(--rp-brand)', values: data.revenueTrend.map((p) => p.value), format: money }]} fill />
          )}
        </section>

        <section className="rp-card">
          <div className="rp-card-head">
            <div>
              <h2>{copy.reports.bookingTrend}</h2>
              <p>{data.range.label}</p>
            </div>
            <div className="rp-card-figure">{kpis.bookings.value}</div>
          </div>
          {empty ? (
            <p className="rp-empty">{copy.reports.noDataHint(data.range.label)}</p>
          ) : (
            <LineChart
              labels={labels}
              series={[{ color: 'var(--rp-blue)', values: data.bookingTrend.map((p) => p.value), format: (v) => `${v} bookings` }]}
              fill
            />
          )}
        </section>
      </div>

      <div className="rp-grid-health">
        <section className="rp-card">
          <h2>{copy.reports.segmentsTitle}</h2>
          <p className="rp-card-sub">{copy.reports.segmentsHint(data.totalCustomers)}</p>
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
                  {copy.reports.segments[segment.key]}
                </span>
                <span className="rp-segment-count">{segment.count}</span>
                <span className="rp-segment-range">{segment.rangeLabel}</span>
              </button>
            ))}
          </div>
          {/* Stated rather than left as an unexplained gap: these customers are
              in the total above and in none of the four buckets, so without
              this line the numbers look like they do not add up. */}
          {data.neverVisited > 0 && <p className="rp-card-foot">{copy.reports.neverVisited(data.neverVisited)}</p>}
        </section>

        <section className="rp-card">
          <h2>{copy.reports.topServices}</h2>
          <p className="rp-card-sub">{data.range.label}</p>
          <BarList
            emptyText={copy.reports.noDataHint(data.range.label)}
            items={data.topServices.map((s) => ({
              label: s.label,
              value: s.value,
              display: money(s.value),
              note: s.retired ? 'retired' : undefined,
            }))}
          />
        </section>
      </div>

      <div className="rp-grid-2">
        <section className="rp-card">
          <h2>{copy.reports.peakHours}</h2>
          <p className="rp-card-sub">{copy.reports.peakHoursHint}</p>
          <Heatmap
            days={data.peakHours.days}
            hours={data.peakHours.hours}
            grid={data.peakHours.grid}
            describe={(day, hour, value) => `${day} ${hour} · ${Math.round(value * 100)}% of your busiest hour`}
          />
          {/* The grid is clamped to opening hours so it stays readable. Anything
              booked outside them is reported here rather than disappearing. */}
          {data.peakHours.outsideOpeningHoursMinutes > 0 && (
            <p className="rp-card-foot">
              {copy.reports.peakOutside(hoursAndMinutes(data.peakHours.outsideOpeningHoursMinutes))}
            </p>
          )}
        </section>

        <section className="rp-card">
          <div className="rp-card-head">
            <div>
              <h2>{copy.reports.opportunities}</h2>
              <p>{copy.reports.opportunitiesHint}</p>
            </div>
            <span className="rp-card-icon rp-amber-ink">
              <IconFlame />
            </span>
          </div>
          {data.opportunities.length === 0 ? (
            <p className="rp-empty">{copy.reports.notEnoughVisits}</p>
          ) : (
            <div className="rp-opps">
              {data.opportunities.map((o) => {
                const late = (o.daysOverdue ?? 0) > 0;
                return (
                  <a key={o.customerId} className="rp-opp" href={`/customers?q=${encodeURIComponent(o.name)}`}>
                    <span className="rp-avatar">{o.initial}</span>
                    <span className="rp-opp-main">
                      <span className="rp-opp-name">{o.name}</span>
                      <span className="rp-opp-meta">
                        {o.intervalDays ? copy.reports.usuallyEvery(o.intervalDays) : ''}
                      </span>
                    </span>
                    <span className="rp-opp-right">
                      <span className="rp-opp-spend">{money(o.lifetimeSpendMinor)}</span>
                      <span className="rp-opp-status" style={{ color: late ? 'var(--rp-red)' : 'var(--rp-amber)' }}>
                        {o.daysOverdue === null
                          ? ''
                          : o.daysOverdue > 0
                            ? copy.reports.overdueBy(o.daysOverdue)
                            : o.daysOverdue === 0
                              ? copy.reports.dueNow
                              : copy.reports.dueIn(-o.daysOverdue)}
                      </span>
                    </span>
                    <span className="rp-opp-chev">
                      <IconArrowRight />
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {empty && (
        <section className="rp-card rp-card-quiet">
          <span className="rp-card-icon rp-muted">
            <IconAlert />
          </span>
          <div>
            <h2>{copy.reports.noData}</h2>
            <p className="rp-card-sub">{copy.reports.noDataHint(data.range.label)}</p>
          </div>
        </section>
      )}
    </div>
  );
}
