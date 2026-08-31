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
import { BarList, ReportTable, type Cell } from './charts';
import { InfoTip } from '../components/InfoTip';
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
  status,
  onSegment,
  onClient,
}: {
  data: ReportCustomers;
  /** Which band the list is filtered to, so the chosen chip reads as chosen. */
  status: string;
  onSegment: (segment: string) => void;
  onClient: (id: string) => void;
}) {
  const c = copy.reports.customersTab;
  const { kpis } = data;

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
      {/*
        Four bands of chrome used to sit between the owner and the client
        list: a tall KPI row, a card of recency bands with its own heading and
        footnote, a card of five action groups, and two distribution charts.
        On a 900px screen the list started below the fold on a page whose
        whole point is finding someone to call.

        Everything above the list is now one card. The figures, the bands and
        the groups are all answers about the same people, so they read as one
        block rather than three, and the list follows immediately.
      */}
      <section className="rp-card rp-client-summary">
        <div className="rp-cs-figures">
          {[
            { label: c.total, value: String(kpis.total.value), metric: kpis.total, compare: false,
              explain: copy.reports.explain.clientsTotal },
            { label: c.newClients, value: String(kpis.newCustomers.value), metric: kpis.newCustomers, compare: data.compare,
              explain: copy.reports.explain.clientsNew },
            { label: c.repeatRate, value: `${data.repeatRatePct.value}%`, metric: data.repeatRatePct, compare: data.compare,
              explain: copy.reports.explain.overviewRepeat },
            { label: c.overdue, value: String(kpis.overdue.value), metric: kpis.overdue, compare: false,
              explain: copy.reports.explain.clientsOverdue },
          ].map((f) => (
            <div className="rp-cs-figure" key={f.label}>
              <span>
                {f.label}
                <InfoTip label={f.label}>{f.explain}</InfoTip>
              </span>
              <strong>{f.value}</strong>
              {f.compare && f.metric.deltaPct !== null && (
                <em style={{ color: f.metric.deltaPct >= 0 ? 'var(--rp-green-ink)' : 'var(--rp-red)' }}>
                  {f.metric.deltaPct >= 0 ? '↑' : '↓'} {Math.abs(f.metric.deltaPct)}%
                </em>
              )}
            </div>
          ))}
        </div>

        {/* One heading for the card. The bands and the groups beneath it are
            both "who these clients are", and a heading each was two lines
            spent saying so twice. */}
        <h3 className="rp-cs-heading">
          {copy.reports.segmentsTitle}
          <em>{copy.reports.segmentsTapHint}</em>
        </h3>

        <div className="rp-cs-block">
          <div className="rp-cs-bands">
            {data.segments.map((seg) => {
              const words = copy.reports.segments[seg.key];
              const on = status === seg.key;
              return (
                <button
                  key={seg.key}
                  type="button"
                  className={`rp-cs-band ${on ? 'is-on' : ''}`}
                  style={{ ['--seg' as string]: SEGMENT_TONE[seg.key] }}
                  aria-pressed={on}
                  title={`${words} · ${seg.rangeLabel}`}
                  onClick={() => onSegment(on ? 'all' : seg.key)}
                >
                  <span className="rp-cs-band-name">
                    <span className="rp-cs-dot" />
                    {words}
                  </span>
                  <span className="rp-cs-band-figure">
                    {seg.count}
                    <em>{data.kpis.total.value > 0 ? Math.round((seg.count / data.kpis.total.value) * 100) : 0}%</em>
                  </span>
                </button>
              );
            })}
            {/* The fifth band, so the four above stop looking like they should
                add up to the total and never do. It used to be a footnote on
                its own line under the card. */}
            {data.neverVisited > 0 && (
              <button
                type="button"
                className="rp-cs-band rp-cs-band-muted"
                style={{ ['--seg' as string]: 'var(--muted)' }}
                title={`${c.neverBand} · no completed visits`}
                onClick={() => onSegment('never')}
              >
                <span className="rp-cs-band-name">
                  <span className="rp-cs-dot" />
                  {c.neverBand}
                </span>
                <span className="rp-cs-band-figure">
                  {data.neverVisited}
                  <em>{data.kpis.total.value > 0 ? Math.round((data.neverVisited / data.kpis.total.value) * 100) : 0}%</em>
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="rp-cs-block">
          <div className="rp-cs-groups">
            {data.opportunities.map((card) => {
              const text = c.cards[card.key as keyof typeof c.cards];
              if (!text) return null;
              return (
                <a className="rp-cs-group" key={card.key} href="/customers">
                  <span className="rp-cs-group-icon">{CARD_ICON[card.key]}</span>
                  <span className="rp-cs-group-figure">{card.count}</span>
                  <span className="rp-cs-group-text">
                    {text.title}
                    <em>{text.hint}</em>
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* The list, immediately. It is what the tab is for. */}
      <Card title={c.top} hint={c.topHint}>
        <ReportTable
          columns={[c.colClient, c.colVisits, c.colSpend, c.colAvg, c.colLast, c.colFavourite, c.colInterval]}
          rows={rows}
          onRowClick={onClient}
          emptyText={copy.reports.noData}
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
    </div>
  );
}
