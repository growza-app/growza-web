'use client';

import { copy } from '../lib/copy';
import type { ReportStaff } from '../lib/api';
import { BarList, ReportTable, type Cell } from './charts';
import { Card, money, moneyBars, utilisationColour } from './shared';

/**
 * Staff — revenue and how full each day actually was.
 *
 * Utilisation divides by hours that could genuinely be sold: every time block
 * is subtracted from the shift first. Dividing by the raw rota is GRW-019 —
 * a stylist off sick still counted as a full day, so the owner was told there
 * were free hours nothing could be booked into (conventions §7).
 *
 * Every noun renders from `ctx.labels`, which is why the table's own subtitle
 * says it works for mechanics and trainers too.
 */
export function StaffTab({ data, providerLabel }: { data: ReportStaff; providerLabel: string }) {
  const c = copy.reports.staffTab;

  const rows = data.rows.map((r) => {
    const cells: Cell[] = [
      { kind: 'avatar', text: r.name, initial: r.name.charAt(0).toUpperCase() },
      { kind: 'text', text: String(r.bookings), align: 'center' },
      { kind: 'text', text: String(r.completed), align: 'center' },
      { kind: 'text', text: money(r.revenueMinor), bold: true },
      { kind: 'text', text: money(r.avgValueMinor), tone: 'var(--muted)' },
      // Null is "no hours set", which is a different fact from "worked none
      // of their hours" — a 0% meaning the former would be a lie.
      r.utilisationPct === null
        ? { kind: 'text', text: c.noHours, tone: 'var(--muted)' }
        : { kind: 'bar', pct: r.utilisationPct },
      r.noShowPct === null
        ? { kind: 'text', text: '—', tone: 'var(--muted)', align: 'center' }
        : {
            kind: 'text',
            text: `${r.noShowPct}%`,
            tone: r.noShowPct >= 8 ? 'var(--rp-red)' : 'var(--muted)',
            align: 'center',
          },
    ];
    return { id: r.id, cells };
  });

  return (
    <div className="rp-stack">
      <div className="rp-grid-2">
        <Card title={c.byRevenue} hint={data.range.label}>
          <BarList items={moneyBars(data.byRevenue)} emptyText={copy.reports.noDataHint(data.range.label)} />
        </Card>
        <Card title={c.utilisation} hint={c.utilisationHint}>
          <BarList
            emptyText={copy.reports.noDataHint(data.range.label)}
            items={data.byUtilisation.map((u) => ({
              label: u.label,
              value: u.value,
              display: `${u.value}%`,
              color: utilisationColour(u.value),
            }))}
          />
        </Card>
      </div>

      <Card title={`${providerLabel} ${c.table.toLowerCase()}`} hint={c.tableHint}>
        <ReportTable
          columns={[c.colName, c.colBookings, c.colCompleted, c.colRevenue, c.colAvg, c.colUtilisation, c.colNoShow]}
          rows={rows}
          emptyText={copy.reports.noDataHint(data.range.label)}
        />
      </Card>
    </div>
  );
}
