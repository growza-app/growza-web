'use client';

import { Children, cloneElement, isValidElement, useId, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons';
import { oklch, usageState, STATUS_COLORS } from '../tokens';

/**
 * Shared admin primitives (GRW-96 in miniature). Every screen composes from
 * these rather than re-implementing a card or a status pill — the same
 * instinct as the tenant portal's shared Pagination/PaginatedTable, applied
 * to the platform plane's own design language.
 */

export function Card({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  /**
   * For placement only — a grid area or column the CARD's parent decides
   * (GRW-277's dashboard columns). Deliberately a class rather than a `style`
   * override: an inline `grid-area` cannot be dropped by the media query that
   * collapses those columns on a phone, which is the same trap the admin
   * table's own template fell into.
   */
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ background: oklch.surface, border: `1px solid ${oklch.border}`, borderRadius: 16, padding: 20, ...style }}
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
 * A grid-based table that becomes a list of cards on a phone (Jira GRW-277).
 *
 * On a laptop this is what it always was: one grid, `minWidthPx` wide at
 * minimum, scrolling sideways inside its own box rather than widening the
 * page.
 *
 * Below the shell's 860px breakpoint that stops being readable — a six-column
 * table in ~340px of phone showed two columns and hid the rest behind a
 * sideways scroll nobody discovers. So each row turns into a small card with
 * one line per field, and the column header supplies each line's label (the
 * header strip itself is then redundant and hidden). Nothing about the layout
 * is decided in JavaScript: the grid template and the minimum width are
 * handed to CSS as custom properties so a media query can drop both, which
 * keeps this consistent with `admin.css`'s own note about not letting the
 * shell flash an unstyled layout while hydrating.
 */
export function Table({ columns, rows, minWidthPx = 640 }: { columns: TableColumn[]; rows: ReactNode; minWidthPx?: number }) {
  const grid = columns.map((c) => c.width).join(' ');
  return (
    <div style={{ background: oklch.surface, border: `1px solid ${oklch.border}`, borderRadius: 16, overflow: 'hidden' }}>
      <div className="admin-table-scroll">
        <div className="admin-table-min" style={{ '--admin-table-min': `${minWidthPx}px` } as CSSProperties}>
          <div
            className="admin-table-head"
            style={
              {
                '--admin-cols': grid,
                background: oklch.surfaceSubtle,
                borderBottom: `1px solid ${oklch.borderStrong}`,
                color: oklch.textFaint,
              } as CSSProperties
            }
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
  /*
   * Each cell is wrapped so the phone layout can label it with its own
   * column heading. The wrapper is `display: contents` on a laptop, so the
   * cells stay direct grid items and that layout is byte-for-byte what it was
   * — and the label pseudo-element only exists inside the mobile media query,
   * where the wrapper becomes a real box.
   */
  return (
    <div
      onClick={onClick}
      className="admin-table-row"
      style={
        {
          '--admin-cols': grid,
          borderBottom: `1px solid ${oklch.divider}`,
          cursor: onClick ? 'pointer' : undefined,
          ...style,
        } as CSSProperties
      }
    >
      {Children.toArray(children).map((cell, i) => (
        <div key={i} className="admin-cell" data-label={columns[i]?.label ?? ''}>
          {cell}
        </div>
      ))}
    </div>
  );
}

export function Toggle({
  on,
  onClick,
  disabled,
  label,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  /**
   * What this toggle controls. The visible label is always a sibling, so
   * without this the control itself has no accessible name — on a screen
   * that stacks sixteen of them (the subscription entitlement panel), that
   * reads out as sixteen identical unnamed buttons.
   */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={on}
      aria-label={label}
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

/**
 * `error` replaces the hint rather than sitting beside it (GRW-175).
 *
 * A field that is wrong has one thing to say, and it is not the tip. Showing
 * both stacks two lines of small grey-and-red text under a 44px input and
 * makes the actionable one harder to find, not easier. `role="alert"` so a
 * screen reader announces it when it appears rather than only on focus.
 */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  /**
   * Jira GRW-277 — the label is actually attached to the control.
   *
   * It was a bare `<label>` beside the input with no `htmlFor` and no `id`,
   * so every field in the admin portal was an unlabelled box: a screen reader
   * announced "edit text, blank" and clicking the word "Phone number" focused
   * nothing. Found because a browser test could not locate the sign-in field
   * by its own visible label — which is the same thing a person using one
   * experiences, only louder.
   *
   * An id the caller already set wins, so a field that is addressed by id
   * elsewhere keeps the id it is addressed by.
   */
  const generatedId = useId();
  const child = isValidElement<{ id?: string }>(children) ? children : null;
  const controlId = child ? (child.props.id ?? generatedId) : undefined;

  return (
    <div>
      <label
        htmlFor={controlId}
        style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)', display: 'block', marginBottom: 7 }}
      >
        {label}
      </label>
      {child ? cloneElement(child, { id: controlId }) : children}
      {error ? (
        <div role="alert" style={{ fontSize: 11.5, fontWeight: 700, color: ERROR_COLOR, marginTop: 6 }}>
          {error}
        </div>
      ) : hint ? (
        <div style={{ fontSize: 11.5, color: 'oklch(0.58 0.02 155)', marginTop: 6 }}>{hint}</div>
      ) : null}
    </div>
  );
}

export const ERROR_COLOR = 'oklch(0.5 0.18 25)';

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

/**
 * `invalid` also sets `aria-invalid`, so the red border is not the only way to
 * know.
 *
 * The invalid style replaces the whole `border` shorthand rather than setting
 * `borderColor` on top of it. React warns about the mix for a real reason:
 * when the field is corrected it removes the longhand while the shorthand
 * stays, so the red border can survive the error that caused it. Found by
 * opening the page — `npm run build:web` and every test were happy with it.
 */
export function TextInput({ invalid, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      style={{ ...inputBase, ...(invalid ? { border: `1px solid ${ERROR_COLOR}` } : {}), ...props.style }}
    />
  );
}

export function Select({
  options,
  invalid,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: string[]; invalid?: boolean }) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      // Same shorthand-not-longhand rule as TextInput above.
      style={{
        ...inputBase,
        padding: '0 12px',
        cursor: 'pointer',
        ...(invalid ? { border: `1px solid ${ERROR_COLOR}` } : {}),
        ...props.style,
      }}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * `disabled` is a real prop, not a style.
 *
 * It used not to exist, so every "disabled" primary button in the portal was
 * disabled in appearance only — `opacity: 0.5, cursor: not-allowed` on a
 * fully clickable control. Callers that meant "you can't do this yet" were
 * telling the truth visually and lying functionally: the click still fired,
 * the request still went, and the admin got a validation error from the
 * server for something the UI had already greyed out.
 */
export function PrimaryButton({
  children,
  onClick,
  style,
  type = 'button',
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Native tooltip — the place to say WHY it is disabled. */
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: 40,
        padding: '0 16px',
        borderRadius: 11,
        border: 'none',
        background: oklch.accent,
        color: 'white',
        fontSize: 13.5,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
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
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  style?: CSSProperties;
  disabled?: boolean;
  /** Native tooltip — the place to say WHY it is disabled. */
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: 40,
        padding: '0 16px',
        borderRadius: 11,
        border: `1px solid ${oklch.borderStrong}`,
        background: 'white',
        color: danger ? oklch.danger : 'oklch(0.36 0.02 155)',
        fontSize: 13.5,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
