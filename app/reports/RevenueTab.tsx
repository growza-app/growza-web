'use client';

import { copy } from '../lib/copy';
import type { ReportRevenue } from '../lib/api';
import { IconCoins, IconRupee, IconUserCheck, IconUserPlus } from '../components/icons';
import { BarList, Donut, LineChart } from './charts';
import { Kpi } from './Kpi';
import { Card, money, moneyBars } from './shared';

const SEGMENT_COLOURS = ['var(--rp-brand)', 'var(--rp-blue)', '#c3cbc6'];
const PAYMENT_COLOURS: Record<string, string> = {
  UPI: 'var(--rp-brand)',
  Card: 'var(--rp-blue)',
  Cash: 'var(--rp-amber)',
  Other: 'var(--rp-purple)',
  'Not recorded': '#c3cbc6',
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
  const c = copy.reports.money;
  const labels = data.range.buckets.map((b) => b.label);
  const { kpis } = data;
  const empty = kpis.completedRevenueMinor.value === 0;

  return (
    <div className="rp-stack">
      <div className="rp-kpi-grid rp-kpi-grid-4">
        <Kpi
          icon={<IconRupee />}
          iconTone="var(--rp-green-ink)"
          label={c.completed}
          value={money(kpis.completedRevenueMinor.value)}
          metric={kpis.completedRevenueMinor}
          compare={data.compare}
        />
        <Kpi
          icon={<IconCoins />}
          iconTone="var(--rp-blue)"
          label={c.total}
          value={money(kpis.totalRevenueMinor.value)}
          metric={kpis.totalRevenueMinor}
          compare={data.compare}
        />
        <Kpi
          icon={<IconUserCheck />}
          iconTone="var(--rp-teal)"
          label={c.perBooking}
          value={money(kpis.avgBookingValueMinor.value)}
          metric={kpis.avgBookingValueMinor}
          compare={data.compare}
        />
        <Kpi
          icon={<IconUserPlus />}
          iconTone="var(--rp-purple)"
          label={c.perClient}
          value={money(kpis.revenuePerCustomerMinor.value)}
          metric={kpis.revenuePerCustomerMinor}
          compare={data.compare}
        />
      </div>

      <Card
        title={c.trend}
        hint={`${c.completedHint} · ${data.range.label}`}
        figure={money(kpis.completedRevenueMinor.value)}
      >
        {empty ? (
          <p className="rp-empty">{copy.reports.noDataHint(data.range.label)}</p>
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
          <BarList items={moneyBars(data.byService)} emptyText={copy.reports.noDataHint(data.range.label)} />
        </Card>
        {/* Absent, not empty, where ranking providers is a product smell — a
            clinic does not have a doctor leaderboard (07 §3.2). */}
        {data.showProviders && (
          <Card title={c.byStaff}>
            <BarList items={moneyBars(data.byProvider)} emptyText={copy.reports.noDataHint(data.range.label)} />
          </Card>
        )}
      </div>

      <div className="rp-grid-2">
        <Card title={c.bySegment}>
          <Donut
            centreLabel={c.completed}
            centreValue={money(kpis.completedRevenueMinor.value)}
            emptyText={copy.reports.noDataHint(data.range.label)}
            segments={data.bySegment.map((s, i) => ({
              label: s.label,
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
          foot={data.byPaymentMethod.some((p) => p.label === 'Not recorded') ? c.notRecordedHint : undefined}
        >
          <BarList
            emptyText={copy.reports.noDataHint(data.range.label)}
            items={data.byPaymentMethod.map((p) => ({
              label: p.label,
              value: p.value,
              display: money(p.value),
              color: PAYMENT_COLOURS[p.label] ?? '#c3cbc6',
            }))}
          />
        </Card>
      </div>
    </div>
  );
}
