'use client';

import { useReportsCopy } from '../lib/use-reports-copy';
import { copy } from '../lib/copy';
import type { ReportServices } from '../lib/api';
import { BarList, ReportTable, type Cell } from './charts';
import { Card, countBars, money, moneyBars, rangeName } from './shared';

/**
 * Services — popular and profitable, shown as the two different questions
 * they are. A ₹400 haircut booked 140 times and a ₹21,000 bridal package
 * booked nine times are both good, in ways an owner has to weigh separately.
 */
export function ServicesTab({ data }: { data: ReportServices }) {
  const rp = useReportsCopy();
  const c = rp.servicesTab;
  const empty = data.rows.length === 0;

  const rows = data.rows.map((r) => {
    const cells: Cell[] = [
      { kind: 'text', text: r.name, bold: true },
      { kind: 'text', text: String(r.bookings), align: 'center' },
      { kind: 'text', text: money(r.revenueMinor), bold: true },
      { kind: 'text', text: money(r.avgPriceMinor), tone: 'var(--muted)' },
      { kind: 'text', text: String(r.durationMin), tone: 'var(--muted)', align: 'center' },
      // Under five clients a percentage is theatre, so it is marked rather
      // than printed as though it were solid.
      r.repeatPct === null || r.distinctCustomers < 5
        ? { kind: 'text', text: c.thinSample, tone: 'var(--muted)' }
        : { kind: 'pill', text: `${r.repeatPct}%`, tone: r.repeatPct >= 50 ? 'var(--rp-green-ink)' : 'var(--muted)' },
      {
        kind: 'text',
        text: `${r.cancelPct}%`,
        tone: r.cancelPct >= 8 ? 'var(--rp-red)' : 'var(--muted)',
        align: 'center',
      },
    ];
    return { id: r.id, cells };
  });

  return (
    <div className="rp-stack">
      <div className="rp-grid-2">
        <Card title={c.mostBooked} hint={c.pairHint}>
          <BarList items={countBars(data.mostBooked, rp.servicesTab.retired)} emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))} />
        </Card>
        <Card title={c.topRevenue} hint={rangeName(data.range, rp.ranges)}>
          <BarList items={moneyBars(data.topRevenue, rp.servicesTab.retired)} emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))} />
        </Card>
      </div>

      <Card title={c.table} hint={c.tableHint}>
        {empty ? (
          <p className="rp-empty">{rp.noDataHint(rangeName(data.range, rp.ranges))}</p>
        ) : (
          <ReportTable
            columns={[c.colService, c.colBookings, c.colRevenue, c.colAvg, c.colMinutes, c.colRepeat, c.colCancel]}
            rows={rows}
            emptyText={rp.noDataHint(rangeName(data.range, rp.ranges))}
          />
        )}
      </Card>
    </div>
  );
}
