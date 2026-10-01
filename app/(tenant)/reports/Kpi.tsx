'use client';

import { useReportsCopy } from '../lib/use-reports-copy';
import type { ReactNode } from 'react';

import type { ReportMetric, ReportPoint } from '../lib/api';
import { IconTrendDown, IconTrendUp } from '../components/icons';
import { InfoTip } from '../components/InfoTip';
import { LineChart } from './charts';

/**
 * A headline figure, its movement, and the series behind it.
 *
 * When there is no previous period the tile says so in words. A green arrow
 * and "0%" would be a claim about a month that never happened, and an owner
 * reading it would have no way to tell the difference (epic BR-07).
 */
export function Kpi({
  icon,
  iconTone,
  label,
  /** What this figure counts, in the owner's terms. Rendered behind an ⓘ. */
  explain,
  value,
  metric,
  compare,
  spark,
  sparkLabels,
  /** What the sparkline plots, when that is not simply the tile's own figure. */
  sparkName,
  sparkFormat,
  /** Higher is worse for things like no-shows, so the colours invert. */
  lowerIsBetter = false,
}: {
  icon: ReactNode;
  iconTone?: string;
  label: string;
  explain?: string;
  value: string;
  metric: ReportMetric;
  compare: boolean;
  spark?: ReportPoint[];
  sparkLabels?: string[];
  sparkName?: string;
  sparkFormat?: (value: number) => string;
  lowerIsBetter?: boolean;
}) {
  const rp = useReportsCopy();
  const delta = metric.deltaPct;
  const good = delta === null ? true : lowerIsBetter ? delta <= 0 : delta >= 0;
  const tone = good ? 'var(--rp-green-ink)' : 'var(--rp-red)';

  return (
    <div className="rp-card rp-kpi">
      <div className="rp-kpi-label">
        <span className="rp-kpi-icon" style={iconTone ? { color: iconTone } : undefined}>
          {icon}
        </span>
        {label}
        {explain && <InfoTip label={label}>{explain}</InfoTip>}
      </div>
      <div className="rp-kpi-value">{value}</div>
      <div className="rp-kpi-foot">
        {compare ? (
          delta === null ? (
            <span className="rp-kpi-nodelta">{rp.noPrior}</span>
          ) : (
            <span className="rp-kpi-delta" style={{ color: tone }}>
              <span className="rp-kpi-delta-icon">{delta >= 0 ? <IconTrendUp /> : <IconTrendDown />}</span>
              {Math.abs(delta)}%
            </span>
          )
        ) : null}
        {spark && spark.length > 0 && sparkLabels && (
          <span className="rp-kpi-spark">
            <LineChart
              labels={sparkLabels}
              series={[{ name: sparkName, color: good ? 'var(--rp-brand)' : 'var(--rp-red)', values: spark.map((p) => p.value), format: sparkFormat }]}
              height={20}
              showAxis={false}
              fill
            />
          </span>
        )}
      </div>
    </div>
  );
}
