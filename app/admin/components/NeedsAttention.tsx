import Link from '../../shared/AppLink';
import { Icon } from '../icons';
import { oklch } from '../tokens';
import { Card } from './primitives';

/** Jira GRW-700 — what the API sends: one row per business per reason. */
export interface NeedsAttentionRow {
  tenantId: string;
  name: string;
  kind: 'payment_failed' | 'setup_stuck' | 'trial_ending';
  since: string;
}

const ZONE = 'Asia/Kolkata';
const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(d);

/** The reason in plain words, and the one place to go about it. Pure, so a test pins the words. */
export function attentionLine(row: NeedsAttentionRow, now: Date = new Date()): { reason: string; action: string; href: string } {
  const page = `/admin/businesses/${row.tenantId}`;
  const since = new Date(row.since);
  switch (row.kind) {
    case 'payment_failed':
      return { reason: 'Payment failed this month', action: 'Open billing', href: `${page}?tab=billing` };
    case 'setup_stuck': {
      const days = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
      return { reason: `Still setting up after ${days} days`, action: 'Open checklist', href: page };
    }
    case 'trial_ending': {
      const ends = day(since);
      const when =
        ends < day(now)
          ? 'Trial has ended'
          : ends === day(now)
            ? 'Trial ends today'
            : ends === day(new Date(now.getTime() + 86_400_000))
              ? 'Trial ends tomorrow'
              : `Trial ends ${new Intl.DateTimeFormat('en-IN', { timeZone: ZONE, day: 'numeric', month: 'short' }).format(since)}`;
      return { reason: when, action: 'Open subscription', href: `${page}?tab=subscription` };
    }
  }
}

/**
 * Jira GRW-700 — the businesses that need an admin today, with the reason and the one tap that deals with it.
 * The tiles count problems; this names who has them. With nothing to do it is one line, not an empty box.
 */
export function NeedsAttention({ rows }: { rows: NeedsAttentionRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.875rem', fontWeight: 700, color: oklch.textMuted }}>
          <span style={{ color: 'oklch(0.5 0.13 150)', display: 'flex' }}>
            <Icon name="check" size={18} />
          </span>
          All clear — no business needs you right now.
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: oklch.textStrong }}>Needs attention</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row, i) => {
          const line = attentionLine(row);
          return (
            <li
              key={`${row.tenantId}:${row.kind}`}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : `1px solid ${oklch.divider}` }}
            >
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: oklch.textStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </span>
                <span style={{ display: 'block', fontSize: '0.8125rem', color: row.kind === 'payment_failed' ? oklch.danger : oklch.textMuted }}>{line.reason}</span>
              </span>
              <Link
                href={line.href}
                style={{
                  flex: 'none',
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  borderRadius: 10,
                  border: `1px solid ${oklch.border}`,
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: oklch.textStrong,
                  textDecoration: 'none',
                }}
              >
                {line.action}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
