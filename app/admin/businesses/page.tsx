'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getBusinesses } from '../data';
import { Icon, TypeIcon } from '../icons';
import { EmptyState, StatusPill, Table, TableRow, type TableColumn } from '../components/primitives';
import { DEFAULT_PAGE_SIZE, Pagination, usePagedSlice, type PaginationState } from '../components/Pagination';
import { useAdminSearch } from '../components/SearchContext';
import { inr, oklch, typeColor } from '../tokens';

const FILTERS = ['All', 'Salon', 'Garage', 'Dental', 'Spa', 'Clinic', 'Fitness'];
const COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.8fr' },
  { label: 'Type', width: '1fr' },
  { label: 'Owner', width: '1.1fr' },
  { label: 'Price / mo', width: '1fr' },
  { label: 'Bookings', width: '1fr' },
  { label: 'Status', width: '0.9fr' },
  { label: '', width: '70px', right: true },
];

/** GRW-79's Businesses list. Reads through the mock data module until GRW-100's admin read layer exists. */
export default function AdminBusinessesPage() {
  const router = useRouter();
  const { query } = useAdminSearch();
  const [typeFilter, setTypeFilter] = useState('All');
  const [paging, setPaging] = useState<PaginationState>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });

  let filtered = getBusinesses().filter((b) => typeFilter === 'All' || b.type === typeFilter);
  const q = query.trim().toLowerCase();
  if (q) filtered = filtered.filter((b) => (b.name + b.owner + b.type + b.city).toLowerCase().includes(q));
  const list = usePagedSlice(filtered, paging);

  return (
    <div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setTypeFilter(f)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 38,
              padding: '0 15px',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
              ...(typeFilter === f
                ? { background: 'oklch(0.31 0.055 158)', color: 'white', border: '1px solid oklch(0.31 0.055 158)' }
                : { background: 'white', color: 'oklch(0.45 0.02 155)', border: `1px solid ${oklch.borderStrong}` }),
            }}
          >
            {f !== 'All' ? <TypeIcon type={f} size={16} /> : null}
            {f === 'All' ? 'All' : f + 's'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No businesses match" sub="Try a different filter or search term." />
      ) : (
        <>
        <Table
          columns={COLUMNS}
          minWidthPx={760}
          rows={list.map((b) => {
            const tc = typeColor(b.type);
            return (
              <TableRow key={b.id} columns={COLUMNS} onClick={() => router.push(`/admin/businesses/${b.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: tc.bg,
                      color: tc.fg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    <TypeIcon type={b.type} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.name}
                    </div>
                    <div style={{ fontSize: 12, color: oklch.textFaint }}>{b.city}</div>
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: tc.fg, background: tc.bg, padding: '4px 10px', borderRadius: 8 }}>{b.type}</span>
                </div>
                <div style={{ fontSize: 13.5, color: 'oklch(0.36 0.02 155)', fontWeight: 600 }}>{b.owner}</div>
                <div>
                  {b.discount > 0 ? (
                    <div>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: 'oklch(0.28 0.02 155)' }}>{inr(b.final)}</span>
                      <span style={{ fontSize: 11.5, color: 'oklch(0.55 0.15 25)', marginLeft: 6, fontWeight: 700 }}>−{inr(b.discount)}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'oklch(0.28 0.02 155)' }}>{inr(b.final)}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>
                  {b.bookings[0]}/{b.bookings[1]}
                </div>
                <div>
                  <StatusPill status={b.status} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/admin/businesses/${b.id}`);
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      border: `1px solid ${oklch.border}`,
                      background: 'white',
                      color: 'oklch(0.5 0.02 155)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="chevronRight" size={15} />
                  </button>
                </div>
              </TableRow>
            );
          })}
        />
        <Pagination total={filtered.length} shown={list.length} state={paging} onChange={setPaging} />
        </>
      )}
    </div>
  );
}
