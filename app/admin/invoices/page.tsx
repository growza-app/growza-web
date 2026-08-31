'use client';

import { useState } from 'react';
import { getBusinesses } from '../data';
import { Card, StatusPill, Table, TableRow, type TableColumn } from '../components/primitives';
import { DEFAULT_PAGE_SIZE, Pagination, usePagedSlice, type PaginationState } from '../components/Pagination';
import { useAdminSearch } from '../components/SearchContext';
import { inr, oklch } from '../tokens';

const GST_RATE = 0.18;
const COLUMNS: TableColumn[] = [
  { label: 'Invoice', width: '0.9fr' },
  { label: 'Business', width: '1.5fr' },
  { label: 'Taxable', width: '0.9fr' },
  { label: 'GST', width: '0.8fr' },
  { label: 'Total', width: '0.9fr' },
  { label: 'Status', width: '0.9fr' },
];

/**
 * GRW-83's Invoices screen. Every total shown here comes with its
 * breakdown — a total is never displayed alone (13-platform-
 * administration.md §10).
 */
export default function AdminInvoicesPage() {
  const { query } = useAdminSearch();
  const [paging, setPaging] = useState<PaginationState>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });

  let filtered = getBusinesses();
  const q = query.trim().toLowerCase();
  if (q) filtered = filtered.filter((b) => b.name.toLowerCase().includes(q));
  const list = usePagedSlice(filtered, paging);

  const rows = list.map((x, i) => {
    const subtotal = x.final;
    const gst = +(subtotal * GST_RATE).toFixed(2);
    const total = +(subtotal + gst).toFixed(2);
    const paid = x.status !== 'Past due';
    return (
      <TableRow key={x.id} columns={COLUMNS}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.3 0.02 155)', fontFamily: 'ui-monospace, monospace' }}>INV-20{41 + i}</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'oklch(0.3 0.02 155)' }}>{x.name}</div>
        <div style={{ fontSize: 13, color: 'oklch(0.45 0.02 155)', fontWeight: 600 }}>{inr(subtotal)}</div>
        <div style={{ fontSize: 13, color: 'oklch(0.45 0.02 155)', fontWeight: 600 }}>{inr(gst)}</div>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'oklch(0.28 0.02 155)' }}>{inr(total)}</div>
        <div>
          <StatusPill status={paid ? 'Paid' : 'Overdue'} />
        </div>
      </TableRow>
    );
  });

  const featured = filtered[0];
  const featSub = featured?.final ?? 0;
  const featGst = +(featSub * GST_RATE).toFixed(2);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 320px)', gap: 16, alignItems: 'start' }}>
      <div>
        <Table columns={COLUMNS} minWidthPx={720} rows={rows} />
        <Pagination total={filtered.length} shown={list.length} state={paging} onChange={setPaging} />
      </div>
      {featured ? (
        <Card>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textFaint }}>INV-2042 · {featured.name}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: oklch.textStrong, marginTop: 2 }}>Growza Base · Aug 2026</div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13.5 }}>
            {[
              ['List price', inr(featured.list), undefined],
              ['Discount', '− ' + inr(featured.discount), 'oklch(0.5 0.15 25)'],
              ['Taxable amount', inr(featSub), undefined],
              ['GST (18%)', inr(featGst), undefined],
            ].map(([label, value, color]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
                <span style={{ fontWeight: 700, color: color ?? 'oklch(0.3 0.02 155)' }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${oklch.border}` }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>Total</span>
            <span style={{ fontSize: 19, fontWeight: 800, color: oklch.accentText }}>{inr(+(featSub + featGst).toFixed(2))}</span>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
