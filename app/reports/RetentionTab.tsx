'use client';

import { copy } from '../lib/copy';
import type { ReportRetention } from '../lib/api';
import { IconClock, IconPercent, IconRepeat } from '../components/icons';
import { LineChart } from './charts';
import { Kpi } from './Kpi';
import { Card } from './shared';

/**
 * Coming back — the tab that settles keep-versus-find with the owner's own
 * numbers.
 *
 * The headline share is the most decision-changing figure on the whole
 * screen, which is exactly why the thin-data guards matter here: a salon six
 * weeks old cannot report how long its clients stay, and printing a confident
 * "14 months" from two data points would be worse than printing nothing.
 */
export function RetentionTab({ data }: { data: ReportRetention }) {
  const c = copy.reports.retentionTab;
  const labels = data.range.buckets.map((b) => b.label);
  const { kpis } = data;
  const lifetimeThin = data.lifetimeSample < data.lifetimeSampleFloor || data.avgLifetimeMonths === null;

  return (
    <div className="rp-stack">
      {/* Three, not four. "New clients" is the Clients tab's figure and is
          plotted right below anyway, so a tile for it here was a third copy
          of one number. */}
      <div className="rp-kpi-grid rp-kpi-grid-3">
        <Kpi icon={<IconPercent />} iconTone="var(--rp-teal)" label={c.repeatRate}
             value={`${kpis.repeatRatePct.value}%`} metric={kpis.repeatRatePct} compare={data.compare} />
        <Kpi icon={<IconRepeat />} iconTone="var(--rp-brand)" label={c.returning}
             value={String(kpis.returning.value)} metric={kpis.returning} compare={data.compare} />
        <Kpi icon={<IconClock />} iconTone="var(--rp-amber)" label={c.avgInterval}
             value={kpis.avgIntervalDays.value ? `${kpis.avgIntervalDays.value} days` : '—'}
             metric={kpis.avgIntervalDays} compare={false} />
      </div>

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
          {lifetimeThin && (
            <p className="rp-card-foot">{c.thinSample(data.lifetimeSample, data.lifetimeSampleFloor)}</p>
          )}
        </section>
      </div>

      <Card title={c.trend} hint={c.repeatRateHint}>
        <LineChart
          labels={labels}
          series={[{ color: 'var(--rp-brand)', values: data.repeatRateTrend.map((p) => p.value), format: (v) => `${v}%` }]}
          fill
        />
      </Card>
    </div>
  );
}
