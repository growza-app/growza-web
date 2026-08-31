'use client';

import { useState } from 'react';
import { getBusinesses } from '../data';
import { StatusPill, Table, TableRow, type TableColumn } from '../components/primitives';
import { DEFAULT_PAGE_SIZE, Pagination, usePagedSlice, type PaginationState } from '../components/Pagination';
import { useAdminSearch } from '../components/SearchContext';
import { inr, oklch } from '../tokens';

const PROVIDERS = ['Razorpay', 'Stripe'];
const COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.4fr' },
  { label: 'Amount', width: '0.9fr' },
  { label: 'Tax', width: '0.7fr' },
  { label: 'Discount', width: '0.8fr' },
  { label: 'Status', width: '1fr' },
  { label: 'Provider · ID', width: '1fr' },
  { label: 'Date', width: '0.9fr' },
];

/**
 * GRW-83's Payments screen — read-only by design. There is no create or
 * edit control anywhere on this screen: payment records come from the
 * provider's own events, never from an admin's hand
 * (13-platform-administration.md §11).
 */
export default function AdminPaymentsPage() {
  const { query } = useAdminSearch();
  const [paging, setPaging] = useState<PaginationState>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  let filtered = getBusinesses();
  const q = query.trim().toLowerCase();
  if (q) filtered = filtered.filter((b) => b.name.toLowerCase().includes(q));
  const list = usePagedSlice(filtered, paging);

  return (
    <div>
    <Table
      columns={COLUMNS}
      minWidthPx={860}
      rows={list.map((b, i) => {
        const base = b.final;
        const tax = +(base * 0.18).toFixed(0);
        const amount = base + tax;
        const status = b.status === 'Past due' ? 'Failed' : i % 5 === 4 ? 'Pending' : 'Success';
        return (
          <TableRow key={b.id} columns={COLUMNS}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>{b.name}</div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'oklch(0.28 0.02 155)' }}>{inr(amount)}</div>
            <div style={{ fontSize: 12.5, color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{inr(tax)}</div>
            <div style={{ fontSize: 12.5, color: b.discount ? 'oklch(0.5 0.15 25)' : oklch.textFaint, fontWeight: 600 }}>{b.discount ? '−' + inr(b.discount) : '—'}</div>
            <div>
              <StatusPill status={status} />
            </div>
            <div style={{ fontSize: 12, color: 'oklch(0.5 0.02 155)', fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
              {PROVIDERS[i % 2]} · pay_{4120 + i}
            </div>
            <div style={{ fontSize: 12.5, color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{28 - i} Aug</div>
          </TableRow>
        );
      })}
    />
    <Pagination total={filtered.length} shown={list.length} state={paging} onChange={setPaging} />
    </div>
  );
}
