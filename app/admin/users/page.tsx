'use client';

import { PLATFORM_USERS } from '../data';
import { StatusPill, Table, TableRow, type TableColumn } from '../components/primitives';
import { oklch } from '../tokens';

const ROLE_COLORS: Record<string, [string, string]> = {
  'Super admin': ['oklch(0.32 0.07 158)', 'oklch(0.93 0.04 155)'],
  'Billing admin': ['oklch(0.5 0.1 210)', 'oklch(0.95 0.035 210)'],
  'Support admin': ['oklch(0.5 0.1 285)', 'oklch(0.95 0.035 285)'],
  'Operations admin': ['oklch(0.5 0.1 65)', 'oklch(0.96 0.05 80)'],
};
const COLUMNS: TableColumn[] = [
  { label: 'User', width: '1.6fr' },
  { label: 'Email', width: '1.6fr' },
  { label: 'Role', width: '1.1fr' },
  { label: 'Last active', width: '1fr' },
  { label: 'Status', width: '0.8fr' },
];

/** GRW-88's Platform Users screen — Growza's own administrators, never a business user (13-platform-administration.md §6). */
export default function AdminUsersPage() {
  return (
    <Table
      columns={COLUMNS}
      minWidthPx={720}
      rows={PLATFORM_USERS.map((u) => {
        const [fg, bg] = ROLE_COLORS[u.role] ?? ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'];
        return (
          <TableRow key={u.email} columns={COLUMNS}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: `oklch(0.95 0.045 ${u.hue})`,
                  color: `oklch(0.45 0.12 ${u.hue})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                  flex: 'none',
                }}
              >
                {u.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}
              </span>
              <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong }}>{u.name}</div>
            </div>
            <div style={{ fontSize: 13, color: 'oklch(0.5 0.02 155)', fontWeight: 500 }}>{u.email}</div>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: fg, background: bg, padding: '4px 10px', borderRadius: 8 }}>{u.role}</span>
            </div>
            <div style={{ fontSize: 13, color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{u.last}</div>
            <div>
              <StatusPill status={u.status} />
            </div>
          </TableRow>
        );
      })}
    />
  );
}
