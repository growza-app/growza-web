'use client';

import { copy } from '../lib/copy';
import type { ReportCustomers } from '../lib/api';
import {
  IconAlert,
  IconArrowRight,
  IconClock,
  IconCoins,
  IconPercent,
  IconRepeat,
  IconStaff,
  IconUserPlus,
} from '../components/icons';
import { BarList, LineChart, ReportTable, type Cell } from './charts';
import { Kpi } from './Kpi';
import { Card, countBars, money } from './shared';

const SEGMENT_TONE: Record<string, string> = {
  active: 'var(--rp-brand)',
  due: 'var(--rp-amber)',
  at_risk: 'var(--rp-red)',
  inactive: 'var(--rp-purple)',
};

const CARD_TONE: Record<string, string> = {
  quiet30: 'var(--rp-red)',
  overdue: 'var(--rp-amber)',
  loyal: 'var(--rp-brand)',
  highValue: 'var(--rp-teal)',
  atRisk: 'var(--rp-purple)',
};

const CARD_ICON: Record<string, React.ReactNode> = {
  quiet30: <IconClock />,
  overdue: <IconAlert />,
  loyal: <IconRepeat />,
  highValue: <IconCoins />,
  atRisk: <IconAlert />,
};

/**
 * Clients — who is worth keeping, and who is slipping.
 *
 * The four segments come from the one shared helper, so a client counted here
 * as Slipping is chipped Slipping on the Clients page and returned by
 * `?status=at_risk`. Re-deriving the boundaries in a third place is the
 * defect conventions §5 exists to stop.
 */
export function CustomersTab({
  data,
  onSegment,
  onClient,
}: {
  data: ReportCustomers;
  onSegment: (segment: string) => void;
  onClient: (id: string) => void;
}) {
  const c = copy.reports.customersTab;
  const { kpis } = data;
  const labels = data.range.buckets.map((b) => b.label);
  const lifetimeThin = data.lifetimeSample < data.lifetimeSampleFloor || data.avgLifetimeMonths === null;

  const rows = data.topCustomers.map((r) => {
    const lastTone =
      r.lastVisitDays === null ? 'var(--muted)'
      : r.lastVisitDays > 45 ? 'var(--rp-red)'
      : r.lastVisitDays > 30 ? 'var(--rp-amber)'
      : 'var(--muted)';
    const cells: Cell[] = [
      { kind: 'avatar', text: r.name, initial: r.initial },
      { kind: 'text', text: String(r.visits), align: 'center' },
      { kind: 'text', text: money(r.lifetimeSpendMinor), bold: true },
      { kind: 'text', text: money(r.avgSpendMinor), tone: 'var(--muted)' },
      {
        kind: 'text',
        text: r.lastVisitDays === null ? c.neverIn : c.daysAgo(r.lastVisitDays),
        tone: lastTone,
        bold: r.lastVisitDays !== null && r.lastVisitDays > 30,
      },
      { kind: 'text', text: r.favouriteService ?? '—', tone: 'var(--muted)' },
      // Under three visits there is one gap at most, which is an anecdote
      // rather than a rhythm — so it shows nothing instead of guessing.
      { kind: 'text', text: r.intervalDays === null ? '—' : `~${r.intervalDays}d`, tone: 'var(--muted)' },
    ];
    return { id: r.id, cells };
  });

  return (
    <div className="rp-stack">
      {/* Four. This tab used to be two — one for who the clients are, one for
          whether they come back — and they read as near-duplicates because
          they described the same people. Merged, the repeat rate belongs in
          the headline row rather than on a page of its own. */}
      <div className="rp-kpi-grid rp-kpi-grid-4">
        <Kpi icon={<IconStaff />} iconTone="var(--rp-blue)" label={c.total}
             value={String(kpis.total.value)} metric={kpis.total} compare={false} />
        <Kpi icon={<IconUserPlus />} iconTone="var(--rp-purple)" label={c.newClients}
             value={String(kpis.newCustomers.value)} metric={kpis.newCustomers} compare={data.compare} />
        <Kpi icon={<IconPercent />} iconTone="var(--rp-teal)" label={c.repeatRate}
             value={`${data.repeatRatePct.value}%`} metric={data.repeatRatePct} compare={data.compare} />
        {/* No comparison: "due back" describes right now, and a delta against
            last month's right-now would not mean anything. */}
        <Kpi icon={<IconAlert />} iconTone="var(--rp-red)" label={c.overdue}
             value={String(kpis.overdue.value)} metric={kpis.overdue} compare={false} />
      </div>

      <Card
        title={copy.reports.segmentsTitle}
        hint={copy.reports.segmentsHint(kpis.total.value)}
        foot={data.neverVisited > 0 ? copy.reports.neverVisited(data.neverVisited) : undefined}
      >
        <div className="rp-segments">
          {data.segments.map((segment) => (
            <button
              key={segment.key}
              type="button"
              className="rp-segment"
              style={{ ['--rp-seg' as string]: SEGMENT_TONE[segment.key] }}
              onClick={() => onSegment(segment.key)}
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
      </Card>

      <Card title={c.opportunities} hint={c.opportunitiesHint}>
        <div className="rp-opp-cards">
          {data.opportunities.map((card) => {
            const text = c.cards[card.key as keyof typeof c.cards];
            if (!text) return null;
            return (
              <div key={card.key} className="rp-opp-card" style={{ ['--rp-seg' as string]: CARD_TONE[card.key] }}>
                <div className="rp-opp-card-head">
                  <span className="rp-opp-card-icon">{CARD_ICON[card.key]}</span>
                  <span className="rp-opp-card-count">{card.count}</span>
                </div>
                <div>
                  <div className="rp-opp-card-title">{text.title}</div>
                  <p className="rp-opp-card-body">{text.body(card.count)}</p>
                </div>
                {/* Reports says who to contact. It never sends anything —
                    every proactive message goes through the compliance funnel
                    with opt-in and an approved template (05, ADR-11). */}
                <a className="rp-opp-card-cta" href="/customers">
                  {c.viewClients}
                  <span className="rp-opp-chev"><IconArrowRight /></span>
                </a>
              </div>
            );
          })}
        </div>
      </Card>

      <h2 className="rp-section-heading">{c.comingBack}</h2>

      <div className="rp-grid-2">
        <Card title={c.mix} hint={c.mixHint}>
          <LineChart
            labels={labels}
            series={[
              { name: 'Regulars', color: 'var(--rp-brand)', values: data.returningSeries.map((p) => p.value) },
              { name: 'New', color: 'var(--rp-blue)', values: data.newSeries.map((p) => p.value) },
            ]}
          />
        </Card>

        <section className="rp-card rp-retention-panel">
          <div className="rp-headline-box">
            <div className="rp-headline-label">
              <span className="rp-card-icon"><IconPercent /></span>
              {c.repeatShare}
            </div>
            <div className="rp-headline-value">
              {data.repeatRevenueSharePct === null ? '—' : `${data.repeatRevenueSharePct}%`}
            </div>
            <p className="rp-headline-hint">{c.repeatShareHint}</p>
          </div>
          <div className="rp-figure-pair">
            <div>
              <span>{c.firstToSecond}</span>
              <strong>{data.firstToSecondPct === null ? '—' : `${data.firstToSecondPct}%`}</strong>
            </div>
            <div>
              <span>{c.lifetime}</span>
              {/* Stated as a sample size, not as a confident average, until
                  there are enough clients behind it to mean anything. */}
              <strong>{lifetimeThin ? '—' : c.months(data.avgLifetimeMonths!)}</strong>
            </div>
          </div>
          <p className="rp-card-foot">
            {lifetimeThin ? c.thinSample(data.lifetimeSample, data.lifetimeSampleFloor) : c.panelBasis}
          </p>
        </section>
      </div>

      <Card title={c.trend} hint={c.trendHint}>
        <LineChart
          labels={labels}
          series={[{ color: 'var(--rp-brand)', values: data.repeatRateTrend.map((p) => p.value), format: (v) => `${v}%` }]}
          fill
        />
      </Card>

      <div className="rp-grid-2">
        <Card title={c.spend} hint={c.spendHint}>
          <BarList items={countBars(data.spend)} emptyText={copy.reports.noData} />
        </Card>
        <Card title={c.frequency} hint={c.frequencyHint}>
          <BarList items={countBars(data.frequency)} emptyText={copy.reports.noData} />
          <div className="rp-figure-pair">
            <div>
              <span>{c.avgInterval}</span>
              <strong>{data.avgIntervalDays === null ? '—' : `${data.avgIntervalDays} days`}</strong>
            </div>
            <div>
              <span>{c.avgVisits}</span>
              <strong>{data.avgVisits}</strong>
            </div>
          </div>
        </Card>
      </div>

      <Card title={c.top} hint={c.topHint}>
        <ReportTable
          columns={[c.colClient, c.colVisits, c.colSpend, c.colAvg, c.colLast, c.colFavourite, c.colInterval]}
          rows={rows}
          onRowClick={onClient}
          emptyText={copy.reports.noData}
        />
      </Card>
    </div>
  );
}
