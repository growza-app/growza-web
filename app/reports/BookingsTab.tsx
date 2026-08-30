'use client';

import { copy } from '../lib/copy';
import type { ReportBookings } from '../lib/api';
import { IconAppointments, IconBan, IconClock, IconUserCheck } from '../components/icons';
import { BarList, Donut, Heatmap, LineChart } from './charts';
import { Kpi } from './Kpi';
import { Card, countBars, hoursAndMinutes } from './shared';

const STATUS_COLOUR: Record<string, string> = {
  completed: 'var(--rp-brand)',
  cancelled: 'var(--rp-red)',
  no_show: 'var(--rp-purple)',
  confirmed: 'var(--rp-blue)',
};

/**
 * Bookings — the shape of demand.
 *
 * Status words come from `copy.status`, so a donut slice reading Finished and
 * a chip on the Bookings screen reading Finished are the same word for the
 * same state. Three vocabularies for four states is the defect GRW-020
 * shipped once already (conventions §3).
 */
export function BookingsTab({ data }: { data: ReportBookings }) {
  const c = copy.reports.bookingsTab;
  const labels = data.range.buckets.map((b) => b.label);
  const { kpis } = data;
  // Straight from copy.status — the same four words the Bookings screen's
  // chips and filters use. Never re-typed here (conventions §3).
  const statusWord = (key: string) =>
    key === 'completed' ? copy.status.done
    : key === 'cancelled' ? copy.status.cancelled
    : key === 'no_show' ? copy.status.didNotCome
    : copy.status.confirmed;

  return (
    <div className="rp-stack">
      {/* Four, not five. "Finished" is the biggest slice of the chart
          directly below, so a tile for it repeated the chart's headline. The
          three that stay are the ones an owner acts on — and two of them are
          better when they fall, so their arrows read the other way round. */}
      <div className="rp-kpi-grid rp-kpi-grid-4">
        <Kpi icon={<IconAppointments />} iconTone="var(--rp-blue)" label={c.total}
             value={String(kpis.total.value)} metric={kpis.total} compare={data.compare} />
        <Kpi icon={<IconUserCheck />} iconTone="var(--rp-purple)" label={copy.status.didNotCome}
             value={String(kpis.noShow.value)} metric={kpis.noShow} compare={data.compare} lowerIsBetter />
        <Kpi icon={<IconBan />} iconTone="var(--rp-red)" label={copy.status.cancelled}
             value={String(kpis.cancelled.value)} metric={kpis.cancelled} compare={data.compare} lowerIsBetter />
        <Kpi icon={<IconClock />} iconTone="var(--rp-teal)" label={c.upcoming}
             value={String(kpis.upcoming.value)} metric={kpis.upcoming} compare={false} />
      </div>

      <Card title={c.trend} hint={`${c.trendHint} · ${data.range.label}`} figure={kpis.total.value}>
        {kpis.total.value === 0 ? (
          <p className="rp-empty">{copy.reports.noDataHint(data.range.label)}</p>
        ) : (
          <LineChart
            labels={labels}
            series={[{ color: 'var(--rp-blue)', values: data.trend.map((p) => p.value), format: (v) => `${v} bookings` }]}
            height={250}
            fill
          />
        )}
      </Card>

      <div className="rp-grid-2">
        {/* The slices cover every booking including the ones called off, so
            they legitimately sum to more than the tile above. The hint says
            so rather than leaving two numbers to look like a contradiction. */}
        <Card title={c.status} hint={c.statusHint}>
          <Donut
            centreLabel={c.total}
            centreValue={String(data.byStatus.reduce((sum, s) => sum + s.value, 0))}
            emptyText={copy.reports.noDataHint(data.range.label)}
            segments={data.byStatus.map((s) => ({
              label: statusWord(s.label),
              value: s.value,
              display: String(s.value),
              color: STATUS_COLOUR[s.label] ?? '#c3cbc6',
            }))}
          />
        </Card>

        {/* Two sources, because two is what the booking path records. The
            design draws four; the other two would be invented (GRW-54 AC-02). */}
        <Card title={c.source} hint={c.sourceHint}>
          <BarList items={countBars(data.bySource)} emptyText={copy.reports.noDataHint(data.range.label)} />
        </Card>
      </div>

      <Card
        title={c.peak}
        hint={c.peakHint}
        foot={
          data.peakPeriods.outsideOpeningHoursMinutes > 0
            ? copy.reports.peakOutside(hoursAndMinutes(data.peakPeriods.outsideOpeningHoursMinutes))
            : undefined
        }
      >
        <Heatmap
          days={data.peakPeriods.days}
          hours={data.peakPeriods.hours}
          grid={data.peakPeriods.grid}
          describe={(day, hour, value) => `${day} ${hour} · ${Math.round(value * 100)}% of your busiest hour`}
        />
      </Card>
    </div>
  );
}
