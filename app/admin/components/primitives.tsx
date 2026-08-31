'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '../icons';
import { oklch, usageState, STATUS_COLORS } from '../tokens';

/**
 * Shared admin primitives (GRW-96 in miniature). Every screen composes from
 * these rather than re-implementing a card or a status pill — the same
 * instinct as the tenant portal's shared Pagination/PaginatedTable, applied
 * to the platform plane's own design language.
 */

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: oklch.surface,
        border: `1px solid ${oklch.border}`,
        borderRadius: 16,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>{title}</h3>
      {right ?? null}
    </div>
  );
}

export function Pill({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 700,
        color: fg,
        background: bg,
        padding: '4px 10px',
        borderRadius: 8,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg }} />
      {text}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const [fg, bg] = STATUS_COLORS[status] ?? ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'];
  return <Pill text={status} fg={fg} bg={bg} />;
}

export function Bar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const { pct, color } = usageState(used, limit);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{label}</span>
        <span style={{ fontWeight: 600, color: oklch.textFaint }}>
          {used.toLocaleString('en-IN')} / {limit.toLocaleString('en-IN')} · {pct}%
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: oklch.divider, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, sub, icon = 'businesses' }: { title: string; sub: string; icon?: IconName }) {
  return (
    <div
      style={{
        background: oklch.surface,
        border: `1px dashed oklch(0.86 0.01 150)`,
        borderRadius: 16,
        padding: '56px 20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'oklch(0.96 0.01 150)',
          color: 'oklch(0.5 0.06 152)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px',
        }}
      >
        <Icon name={icon} size={24} />
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: 'oklch(0.3 0.02 155)' }}>{title}</div>
      <div style={{ fontSize: 13.5, color: oklch.textFaint, marginTop: 5 }}>{sub}</div>
    </div>
  );
}

export interface TableColumn {
  label: string;
  right?: boolean;
  /** CSS grid track, e.g. '1.5fr' or '120px'. */
  width: string;
}

/**
 * A grid-based table with its own horizontal scroll — the row content never
 * widens the page. `minWidthPx` is the point below which it scrolls instead
 * of squeezing; every screen picks one for its own column set.
 */
export function Table({ columns, rows, minWidthPx = 640 }: { columns: TableColumn[]; rows: ReactNode; minWidthPx?: number }) {
  const grid = columns.map((c) => c.width).join(' ');
  return (
    <div style={{ background: oklch.surface, border: `1px solid ${oklch.border}`, borderRadius: 16, overflow: 'hidden' }}>
      <div className="admin-table-scroll">
        <div style={{ minWidth: minWidthPx }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              padding: '13px 20px',
              background: oklch.surfaceSubtle,
              borderBottom: `1px solid ${oklch.borderStrong}`,
              fontSize: 11,
              fontWeight: 800,
              color: oklch.textFaint,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {columns.map((c, i) => (
              <div key={i} style={c.right ? { textAlign: 'right' } : undefined}>
                {c.label}
              </div>
            ))}
          </div>
          {rows}
        </div>
      </div>
    </div>
  );
}

export function TableRow({
  columns,
  children,
  onClick,
  style,
}: {
  columns: TableColumn[];
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const grid = columns.map((c) => c.width).join(' ');
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: grid,
        alignItems: 'center',
        padding: '14px 20px',
        borderBottom: `1px solid ${oklch.divider}`,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={on}
      disabled={disabled}
      style={{
        width: 46,
        height: 26,
        borderRadius: 99,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        position: 'relative',
        background: on ? oklch.accent : 'oklch(0.85 0.01 150)',
        opacity: disabled ? 0.55 : 1,
        transition: 'background 0.15s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.15s',
          boxShadow: '0 1px 3px oklch(0.2 0.02 150 / 0.3)',
        }}
      />
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)', display: 'block', marginBottom: 7 }}>
        {label}
      </label>
      {children}
      {hint ? <div style={{ fontSize: 11.5, color: 'oklch(0.58 0.02 155)', marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

const inputBase: CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 14px',
  borderRadius: 11,
  border: `1px solid ${oklch.borderStrong}`,
  background: oklch.inputBg,
  fontSize: 14,
  fontWeight: 600,
  outline: 'none',
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputBase, ...props.style }} />;
}

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: string[] }) {
  return (
    <select {...props} style={{ ...inputBase, padding: '0 12px', cursor: 'pointer', ...props.style }}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function PrimaryButton({
  children,
  onClick,
  style,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        height: 40,
        padding: '0 16px',
        borderRadius: 11,
        border: 'none',
        background: oklch.accent,
        color: 'white',
        fontSize: 13.5,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  danger,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 40,
        padding: '0 16px',
        borderRadius: 11,
        border: `1px solid ${oklch.borderStrong}`,
        background: 'white',
        color: danger ? oklch.danger : 'oklch(0.36 0.02 155)',
        fontSize: 13.5,
        fontWeight: 700,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
