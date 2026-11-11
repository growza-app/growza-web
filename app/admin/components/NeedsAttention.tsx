import Link from '../../shared/AppLink';
import { Icon } from '../icons';
import { oklch } from '../tokens';
import { Card } from './primitives';
import { useAdminMe } from './AdminMeContext';

/** Jira GRW-700 — what the API sends: one row per business per reason. */
export interface NeedsAttentionRow {
  tenantId: string;
  name: string;
  kind: 'overdue' | 'payment_failed' | 'setup_stuck' | 'trial_ending';
  since: string;
  /** `overdue` only — where on the way to suspension, what is owed, and when it will be suspended (null: paused). */
  stage?: 'PAYMENT_FAILED' | 'GRACE_PERIOD' | 'PAST_DUE';
  owedMinor?: number;
  suspendsAt?: string | null;
}

const STAGE_WORDS = { PAYMENT_FAILED: 'Payment failed', GRACE_PERIOD: 'Grace period', PAST_DUE: 'Past due' } as const;
const rupees = (minor: number) => {
  const paise = minor % 100 !== 0;
  return `₹${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const shortDay = (d: Date) => new Intl.DateTimeFormat('en-IN', { timeZone: ZONE, day: 'numeric', month: 'short' }).format(d);

const ZONE = 'Asia/Kolkata';
const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(d);

/** The reason in plain words, and the one place to go about it. Pure, so a test pins the words. */
export function attentionLine(
  row: NeedsAttentionRow,
  now: Date = new Date(),
  /** QA loophole L5 — "Record payment" only for an admin who may record one; anyone else is sent to look. */
  canRecordPayment = true,
): { reason: string; action: string; href: string } {
  const page = `/admin/businesses/${row.tenantId}`;
  const since = new Date(row.since);
  switch (row.kind) {
    case 'overdue': {
      // Owner, 11 Nov 2026 — "Grace period · 2 days overdue · ₹799 owed · suspends 14 Nov".
      const days = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
      const parts = [
        row.stage ? STAGE_WORDS[row.stage] : 'Overdue',
        days === 0 ? 'overdue since today' : days === 1 ? '1 day overdue' : `${days} days overdue`,
        row.owedMinor ? `${rupees(row.owedMinor)} owed` : null,
        row.suspendsAt ? `suspends ${shortDay(new Date(row.suspendsAt))}` : null,
      ].filter(Boolean);
      return { reason: parts.join(' · '), action: canRecordPayment ? 'Record payment' : 'Open subscription', href: `${page}?tab=subscription` };
    }
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
/** Owner, 11 Nov 2026 — the list lives on its own page now (`/admin/needs-attention`); the dashboard shows a tile. */
export function NeedsAttention({
  rows,
  emptyText = 'All clear — no business needs you right now.',
}: {
  rows: NeedsAttentionRow[];
  emptyText?: string;
}) {
  const { can } = useAdminMe();
  const canRecordPayment = can('admin.payment.record');
  if (rows.length === 0) {
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.875rem', fontWeight: 700, color: oklch.textMuted }}>
          <span style={{ color: 'oklch(0.5 0.13 150)', display: 'flex' }}>
            <Icon name="check" size={18} />
          </span>
          {emptyText}
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row, i) => {
          const line = attentionLine(row, undefined, canRecordPayment);
          return (
            <li
              key={`${row.tenantId}:${row.kind}`}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : `1px solid ${oklch.divider}` }}
            >
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: oklch.textStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </span>
                <span style={{ display: 'block', fontSize: '0.8125rem', color: row.kind === 'payment_failed' || row.kind === 'overdue' ? oklch.danger : oklch.textMuted }}>{line.reason}</span>
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
