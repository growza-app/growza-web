'use client';

import { useReportsCopy } from '../lib/use-reports-copy';
import type { ReportRevenue } from '../lib/api';
import { IconCoins, IconRupee, IconUserPlus } from '../components/icons';
import { BarList, Donut, LineChart } from './charts';
import { Kpi } from './Kpi';
import { Card, money, moneyBars, rangeName } from './shared';
import { useRowName } from './use-row-name';

const SEGMENT_COLOURS = ['var(--rp-brand)', 'var(--rp-blue)', '#c3cbc6'];
/** Keyed by the payment code (Jira GRW-363), not the English word the CSV writes. */
const PAYMENT_COLOURS: Record<string, string> = {
  upi: 'var(--rp-brand)',
  card: 'var(--rp-blue)',
  cash: 'var(--rp-amber)',
  other: 'var(--rp-purple)',
  not_recorded: '#c3cbc6',
};

/**
 * Money — the same earnings cut four ways.
 *
 * Every figure here resolves through the coalesce chain, and the three
 * breakdowns each sum to the headline. That is asserted server-side rather
 * than trusted: a split that quietly disagrees with the total above it is the
 * defect this tab is most likely to ship.
 */
export function RevenueTab({ data }: { data: ReportRevenue }) {
  const rp = useReportsCopy();
  const nameOf = useRowName();
  const c = rp.money;
  const labels = data.range.buckets.map((b) => b.label);
  const { kpis } = data;
  const empty = kpis.completedRevenueMinor.value === 0;

  return (
    <div className="rp-stack">
      {/* Three, not four. "Money booked" sat beside "Money earned" as two
          large figures a few percent apart, which reads as a discrepancy
          rather than as a distinction. The difference is worth stating, so it
          is stated in a sentence under the trend where there is room to say
          what it means. */}
      <div className="rp-kpi-grid rp-kpi-grid-3">
        <Kpi
          icon={<IconRupee />}
          iconTone="var(--rp-green-ink)"
          label={c.earned}
          explain={rp.explain.revenueCompleted}
          value={money(kpis.completedRevenueMinor.value)}
          metric={kpis.completedRevenueMinor}
          compare={data.compare}
        />
        <Kpi
          icon={<IconCoins />}
          iconTone="var(--rp-amber)"
          label={c.perVisit}
          explain={rp.explain.revenueAvgBooking}
          value={money(kpis.avgBookingValueMinor.value)}
          metric={kpis.avgBookingValueMinor}
          compare={data.compare}
        />
        <Kpi
          icon={<IconUserPlus />}
          iconTone="var(--rp-purple)"
          label={c.perClient}
          explain={rp.explain.revenuePerClient}
          value={money(kpis.revenuePerCustomerMinor.value)}
          metric={kpis.revenuePerCustomerMinor}
          compare={data.compare}
        />
      </div>

      <Card
        title={c.trend}
        hint={`${c.trendHint} · ${rangeName(data.range, rp.ranges)}`}
        figure={money(kpis.completedRevenueMinor.value)}
        foot={c.bookedNote(money(kpis.totalRevenueMinor.value))}
      >
        {empty ? (
          <p className="rp-empty">{rp.noDataHint(rangeName(data.range, rp.ranges))}</p>
        ) : (
          <LineChart
            labels={labels}
            series={[{ color: 'var(--rp-brand)', values: data.trend.map((p) => p.value), format: money }]}
            height={250}
            fill
          />
        )}
      </Card>

      <div className={data.showProviders ? 'rp-grid-2' : ''}>
        <Card title={c.byService}>
          <BarList items={moneyBars(data.byService, rp.servicesTab.retired, nameOf)} emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))} />
        </Card>
        {/* Absent, not empty, where ranking providers is a product smell — a
            clinic does not have a doctor leaderboard (07 §3.2). */}
        {data.showProviders && (
          <Card title={c.byStaff}>
            <BarList items={moneyBars(data.byProvider, rp.servicesTab.retired, nameOf)} emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))} />
          </Card>
        )}
      </div>

      <div className="rp-grid-2">
        <Card title={c.bySegment}>
          <Donut
            centreLabel={c.earned}
            centreValue={money(kpis.completedRevenueMinor.value)}
            emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))}
            segments={data.bySegment.map((s, i) => ({
              label: nameOf(s),
              value: s.value,
              display: money(s.value),
              color: SEGMENT_COLOURS[i] ?? '#c3cbc6',
            }))}
          />
        </Card>

        <Card
          title={c.byPayment}
          // Stated rather than hidden: the one-tap "done" path records no
          // amount, so "Not recorded" is a real slice and pretending every
          // visit was accounted for would misread the split.
          foot={data.byPaymentMethod.some((p) => p.key === 'not_recorded') ? c.notRecordedHint : undefined}
        >
          <BarList
            emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))}
            items={data.byPaymentMethod.map((p) => ({
              label: nameOf(p),
              value: p.value,
              display: money(p.value),
              color: PAYMENT_COLOURS[p.key ?? ''] ?? '#c3cbc6',
            }))}
          />
        </Card>
      </div>
    </div>
  );
}
