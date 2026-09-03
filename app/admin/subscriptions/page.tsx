'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getBusinesses } from '../data';
import { StatusPill, Table, TableRow, SecondaryButton, type TableColumn } from '../components/primitives';
import { DiscountModal } from '../components/DiscountModal';
import { DEFAULT_PAGE_SIZE, Pagination, usePagedSlice, type PaginationState } from '../components/Pagination';
import { useAdminSearch } from '../components/SearchContext';
import { inr, oklch, typeColor } from '../tokens';
import { TypeIcon } from '../icons';
import { PreviewBanner } from '../components/PreviewBanner';

const FILTERS = ['All', 'Active', 'Trial', 'Past due', 'Discounted'];
const COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.7fr' },
  { label: 'Plan', width: '1fr' },
  { label: 'List', width: '0.9fr' },
  { label: 'Discount', width: '0.9fr' },
  { label: 'Final', width: '0.9fr' },
  { label: 'Status', width: '0.9fr' },
  { label: 'Next billing', width: '0.9fr' },
  { label: '', width: '150px', right: true },
];

/**
 * GRW-81's Subscriptions list. List, discount and final price are always
 * three separate columns — a final price shown alone would hide that it is
 * an exception (13-platform-administration.md §2.1).
 */
export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const { query } = useAdminSearch();
  const [statusFilter, setStatusFilter] = useState('All');
  const [discountTarget, setDiscountTarget] = useState<string | null>(null);
  const [paging, setPaging] = useState<PaginationState>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });

  let filtered = getBusinesses();
  if (statusFilter === 'Discounted') filtered = filtered.filter((b) => b.discount > 0);
  else if (statusFilter !== 'All') filtered = filtered.filter((b) => b.status === statusFilter);
  const q = query.trim().toLowerCase();
  if (q) filtered = filtered.filter((b) => (b.name + b.owner).toLowerCase().includes(q));
  const list = usePagedSlice(filtered, paging);

  return (
    <>
      <PreviewBanner shows="The subscriptions list, reading the real subscription records" epic="Jira GRW-111" />
      <div>
        <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              style={{
                height: 38,
                padding: '0 16px',
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
                ...(statusFilter === f
                  ? { background: 'oklch(0.31 0.055 158)', color: 'white', border: '1px solid oklch(0.31 0.055 158)' }
                  : { background: 'white', color: 'oklch(0.45 0.02 155)', border: `1px solid ${oklch.borderStrong}` }),
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <Table
          columns={COLUMNS}
          minWidthPx={900}
          rows={list.map((b) => {
            const tc = typeColor(b.type);
            return (
              <TableRow key={b.id} columns={COLUMNS}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: tc.bg, color: tc.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <TypeIcon type={b.type} size={16} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                    <div style={{ fontSize: 11.5, color: oklch.textFaint }}>{b.owner}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'oklch(0.4 0.02 155)' }}>Base</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.45 0.02 155)' }}>{inr(b.list)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: b.discount ? 'oklch(0.5 0.15 25)' : oklch.textFaint }}>{b.discount ? '−' + inr(b.discount) : '—'}</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: oklch.accentText }}>{inr(b.final)}</div>
                <div>
                  <StatusPill status={b.status} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{b.next}</div>
                <div style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <SecondaryButton onClick={() => router.push(`/admin/subscriptions/${b.id}`)} style={{ height: 32, padding: '0 12px', fontSize: 12.5 }}>
                    View
                  </SecondaryButton>
                  <SecondaryButton onClick={() => setDiscountTarget(b.name)} style={{ height: 32, padding: '0 12px', fontSize: 12.5, color: oklch.accentText }}>
                    Discount
                  </SecondaryButton>
                </div>
              </TableRow>
            );
          })}
        />
        <Pagination total={filtered.length} shown={list.length} state={paging} onChange={setPaging} />

        <DiscountModal businessName={discountTarget} onClose={() => setDiscountTarget(null)} />
      </div>
    </>
  );
}
