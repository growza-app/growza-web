'use client';

import { useReportsCopy } from '../lib/use-reports-copy';
import { useLocale, useTranslations } from 'next-intl';
import type { ReportBookings } from '../lib/api';
import { IconAppointments, IconBan, IconUserCheck } from '../components/icons';
import { BarList, Donut, Heatmap, LineChart } from './charts';
import { Kpi } from './Kpi';
import { weekdayShort } from '../lib/format';
import { Card, countBars, rangeName } from './shared';
import { linearTrend } from './trend';
import { TokenFigures } from '../components/home/TokenFigures';
import { useRowName } from './use-row-name';

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
  const rp = useReportsCopy();
  const st = useTranslations('status');
  const tt = useTranslations('tokens');
  const locale = useLocale();
  const nameOf = useRowName();
  const c = rp.bookingsTab;
  // Jira GRW-363 — the grid's rows named in the owner's language; the API's English only
  // when it predates `dayNumbers`.
  const days = data.peakPeriods.dayNumbers?.map((n) => weekdayShort(n, locale)) ?? data.peakPeriods.days;
  const labels = data.range.buckets.map((b) => b.label);
  const { kpis } = data;
  // Straight from copy.status — the same four words the Bookings screen's
  // chips and filters use. Never re-typed here (conventions §3).
  const statusWord = (key: string) =>
    key === 'completed' ? st('done')
    : key === 'cancelled' ? st('cancelled')
    : key === 'no_show' ? st('didNotCome')
    : st('confirmed');

  // The card is headed with a question, so it answers it. A fitted straight
  // line is the direction the zigzag is actually going, and the sentence
  // below says the same thing for anyone who does not read charts.
  const trend = linearTrend(data.trend.map((p) => p.value));
  const unit = data.range.bucketUnit === 'day' ? 'day' : data.range.bucketUnit;
  const verdict = trend
    ? {
        headline: c.trendVerdict[trend.direction],
        detail:
          trend.direction === 'flat'
            ? c.trendSteady(Math.round((trend.from + trend.to) / 2), unit)
            : c.trendDetail(Math.round(trend.from), Math.round(trend.to), unit),
      }
    : null;

  return (
    <div className="rp-stack">
      {/* Three, not five. "Finished" is the biggest slice of the chart
          directly below, so a tile for it repeated the chart's headline. The
          three that stay are the ones an owner acts on — and two of them are
          better when they fall, so their arrows read the other way round. */}
      <div className="rp-kpi-grid rp-kpi-grid-3">
        <Kpi icon={<IconAppointments />} iconTone="var(--rp-blue)" label={c.total} explain={rp.explain.bookingsTotal}
             value={String(kpis.total.value)} metric={kpis.total} compare={data.compare} />
        <Kpi icon={<IconUserCheck />} iconTone="var(--rp-purple)" label={st('didNotCome')} explain={rp.explain.bookingsNoShow}
             value={String(kpis.noShow.value)} metric={kpis.noShow} compare={data.compare} lowerIsBetter />
        <Kpi icon={<IconBan />} iconTone="var(--rp-red)" label={st('cancelled')} explain={rp.explain.bookingsCancelled}
             value={String(kpis.cancelled.value)} metric={kpis.cancelled} compare={data.compare} lowerIsBetter />
      </div>

      {/* The verdict IS the hint. It used to sit below the head as its own
          block, under a generic line about buckets — three stacked lines
          where the card only ever had one thing to say. The answer to the
          heading now goes where the explanation went. */}
      <Card
        title={c.trend}
        hint={
          verdict ? (
            <>
              <strong className={`rp-verdict-word is-${trend!.direction}`}>{verdict.headline}</strong>{' '}
              {verdict.detail}
            </>
          ) : (
            c.trendTooShort
          )
        }
        figure={kpis.total.value}
      >
        {kpis.total.value === 0 ? (
          <p className="rp-empty">{rp.noDataHint(rangeName(data.range, rp.ranges))}</p>
        ) : (
          <>
            <LineChart
              labels={labels}
              series={[
                { color: 'var(--rp-blue)', values: data.trend.map((p) => p.value), format: rp.bookingsCount },
                ...(trend
                  ? [{ color: 'var(--rp-slate, #7d8a84)', values: trend.line, dashed: true }]
                  : []),
              ]}
              height={170}
              fill
            />
          </>
        )}
      </Card>

      {/* Jira GRW-406 — the counter's tokens over the same days: given, served, paid, left without service. */}
      {data.tokens ? (
        <Card title={tt('figuresReport')} hint={tt('figuresReportHint')} figure={data.tokens.issued}>
          <TokenFigures figures={data.tokens} />
        </Card>
      ) : null}

      <div className="rp-grid-2">
        {/* The slices cover every booking including the ones called off, so
            they legitimately sum to more than the tile above. The hint says
            so rather than leaving two numbers to look like a contradiction. */}
        <Card title={c.status} hint={c.statusHint}>
          <Donut
            centreLabel={c.total}
            centreValue={String(data.byStatus.reduce((sum, s) => sum + s.value, 0))}
            emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))}
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
          <BarList items={countBars(data.bySource, rp.servicesTab.retired, nameOf)} emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))} />
        </Card>
      </div>

      <Card
        title={c.peak}
        hint={c.peakHint}
        foot={
          data.peakPeriods.outsideOpeningHoursMinutes > 0
            ? rp.peakOutside(rp.duration(data.peakPeriods.outsideOpeningHoursMinutes))
            : undefined
        }
      >
        <Heatmap
          days={days}
          hours={data.peakPeriods.hours}
          grid={data.peakPeriods.grid}
          describe={(day, hour, value) => c.peakCell(day, hour, Math.round(value * 100))}
          quietWord={c.peakQuiet}
          busyWord={c.peakBusy}
        />
      </Card>
    </div>
  );
}
