'use client';

import type { ReactNode } from 'react';

/**
 * One cell of a report table. The variants exist because these tables mix
 * kinds of value — a name with an avatar, a percentage as a pill, a
 * utilisation figure as an inline bar — and spelling each out at every call
 * site is how two tables end up rendering the same thing differently.
 */
export type Cell =
  | { kind: 'text'; text: string; bold?: boolean; tone?: string; align?: 'left' | 'center' | 'right' }
  /** `nobody` — Jira GRW-363: the no-stylist row, a neutral mark instead of a person's coloured initials. */
  | { kind: 'avatar'; text: string; initial: string; nobody?: boolean }
  | { kind: 'pill'; text: string; tone?: string }
  | { kind: 'bar'; pct: number };

export interface TableRow {
  id: string;
  cells: Cell[];
}

function renderCell(cell: Cell): ReactNode {
  switch (cell.kind) {
    case 'avatar':
      return (
        <span className="rp-cell-avatar">
          <span className={cell.nobody ? 'rp-avatar is-nobody' : 'rp-avatar'}>{cell.initial}</span>
          <span className="rp-cell-name">{cell.text}</span>
        </span>
      );
    case 'pill':
      return (
        <span className="rp-pill" style={cell.tone ? { color: cell.tone } : undefined}>
          {cell.text}
        </span>
      );
    case 'bar':
      return (
        <span className="rp-cell-bar">
          <span className="rp-cell-bar-track">
            <span
              className="rp-cell-bar-fill"
              style={{
                width: `${Math.min(100, cell.pct)}%`,
                background: cell.pct >= 70 ? 'var(--rp-brand)' : cell.pct >= 50 ? 'var(--rp-amber)' : 'var(--rp-red)',
              }}
            />
          </span>
          <span className="rp-cell-bar-value">{cell.pct}%</span>
        </span>
      );
    default:
      return (
        <span style={{ fontWeight: cell.bold ? 700 : 500, color: cell.tone }}>{cell.text}</span>
      );
  }
}

export function ReportTable({
  columns,
  rows,
  onRowClick,
  emptyText,
}: {
  columns: string[];
  rows: TableRow[];
  onRowClick?: (id: string) => void;
  emptyText: string;
}) {
  if (rows.length === 0) return <p className="rp-empty">{emptyText}</p>;

  return (
    <div className="rp-table-scroll">
      <table className="rp-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={onRowClick ? 'rp-row-clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row.id) : undefined}
            >
              {row.cells.map((cell, i) => (
                <td key={i} style={{ textAlign: cell.kind === 'text' ? (cell.align ?? 'left') : 'left' }}>
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
