'use client';

import { useState } from 'react';
import { AUDIT_LOG } from '../data';
import { Icon } from '../icons';
import { Card } from '../components/primitives';
import { DEFAULT_PAGE_SIZE, Pagination, usePagedSlice, type PaginationState } from '../components/Pagination';
import { useAdminSearch } from '../components/SearchContext';
import { oklch } from '../tokens';

/**
 * GRW-78's Audit Log screen. Every sensitive admin action lands here with
 * who, what changed, and — where the action needed one — a reason. Read
 * only: there is no edit or delete control on an audit row
 * (13-platform-administration.md §8).
 */
export default function AdminAuditLogsPage() {
  const { query } = useAdminSearch();
  const [paging, setPaging] = useState<PaginationState>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const q = query.trim().toLowerCase();
  const filtered = q ? AUDIT_LOG.filter((l) => (l.action + l.biz + l.admin + l.detail).toLowerCase().includes(q)) : AUDIT_LOG;
  const logs = usePagedSlice(filtered, paging);

  return (
    <>
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {logs.map((l, i) => (
          <div key={`${l.admin}-${l.time}`} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: i < logs.length - 1 ? `1px solid ${oklch.divider}` : 'none', flexWrap: 'wrap' }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `oklch(0.95 0.04 ${l.hue})`,
                color: `oklch(0.5 0.13 ${l.hue})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
              }}
            >
              <Icon name="audit" size={17} />
            </span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>{l.action}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.5 0.02 155)', background: oklch.divider, padding: '2px 8px', borderRadius: 6 }}>{l.entity}</span>
                <span style={{ fontSize: 12.5, color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>· {l.biz}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'oklch(0.5 0.02 155)', marginTop: 4 }}>{l.detail}</div>
            </div>
            <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600, textAlign: 'right', flex: 'none' }}>
              <div>{l.admin}</div>
              <div style={{ marginTop: 2 }}>{l.time}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
    <Pagination total={filtered.length} shown={logs.length} state={paging} onChange={setPaging} />
    </>
  );
}
