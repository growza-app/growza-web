'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from './lib/api';
import { Icon } from './icons';
import { Card, SecondaryButton, StatusPill } from './components/primitives';
import { oklch } from './tokens';

/**
 * GRW-104's platform dashboard. GRW-020 — "Two Home labels that were not
 * true" — already paid for the mistake this story exists to prevent: a
 * dashboard figure is a claim a platform admin acts on, and most of what a
 * dashboard like this one eventually shows (MRR, payment failures,
 * near-limit counts) belongs to epics that have not shipped. So this screen
 * only renders the three counts with a real query behind them (total
 * businesses, the status breakdown, new businesses this period) plus an
 * honest attention panel — every row present, every row unavailable today,
 * naming the Jira epic that fills it in rather than a fabricated zero
 * (BR-01/BR-02). The mock version this replaced had exactly the MRR-tile,
 * payment-failure-count shape BR-01 forbids.
 */

interface StatusCount {
  status: string;
  count: number;
}

interface AttentionRow {
  key: string;
  label: string;
  available: boolean;
  count?: number;
  /** Where the count came from (GRW-119) — an available row is a way in, not a number to stare at. */
  href?: string;
  epic?: string;
}

interface DashboardResponse {
  totalBusinesses: number;
  byStatus: StatusCount[];
  newBusinesses: { count: number; period: { from: string; to: string } };
  attention: AttentionRow[];
}

const STATUS_LABEL: Record<string, string> = {
  provisioning: 'Provisioning',
  active: 'Active',
  suspended: 'Suspended',
  churned: 'Churned',
};

function monthLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(iso));
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminFetch<DashboardResponse>('/dashboard')
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof AdminApiError ? err.message : 'Could not load the dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
          <SecondaryButton onClick={() => setRetryToken((n) => n + 1)}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <div style={{ height: 74, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
            </Card>
          ))}
        </div>
        <Card>
          <div style={{ height: 220, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
        </Card>
      </div>
    );
  }

  const empty = data.totalBusinesses === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* FR-01/AC-01 — the only three figures on this screen with a real query behind them. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <KpiCard icon="businesses" label="Total businesses" value={data.totalBusinesses} href="/admin/businesses" />
        <KpiCard
          icon="trend"
          label={`New businesses — ${monthLabel(data.newBusinesses.period.from)}`}
          value={data.newBusinesses.count}
          href={`/admin/businesses?createdFrom=${encodeURIComponent(data.newBusinesses.period.from)}`}
        />
        <Card>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted, marginBottom: 10 }}>By status</div>
          {empty ? (
            <div style={{ fontSize: 13, color: oklch.textFaint }}>No businesses on the platform yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.byStatus.map((s) => (
                <Link
                  key={s.status}
                  href={`/admin/businesses?status=${s.status}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}
                >
                  <StatusPill status={STATUS_LABEL[s.status] ?? s.status} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>{s.count}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* FR-02/AC-02 — every row present whether or not its epic has shipped; none of them is a real count yet. */}
      <Card>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Billing attention</h3>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {data.attention.map((row, i) => (
            <AttentionRowView key={row.key} row={row} isLast={i === data.attention.length - 1} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, href }: { icon: 'businesses' | 'trend'; label: string; value: number; href: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <Card>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: 'oklch(0.95 0.04 150)',
            color: 'oklch(0.45 0.12 150)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} />
        </span>
        <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1, marginTop: 14, color: oklch.textStrong }}>{value.toLocaleString('en-IN')}</div>
        <div style={{ fontSize: 12.5, color: oklch.textMuted, marginTop: 5, fontWeight: 500 }}>{label}</div>
      </Card>
    </Link>
  );
}

/** BR-01/BR-02 — unavailable and zero must look different; this is the one place that distinction is drawn. */
/**
 * Jira GRW-159 · GRW-167 — what each attention row means, in its own words.
 *
 * Keyed by the row's own key rather than written once for all of them: the
 * rows are not the same kind of problem. A failed payment is a customer who
 * tried; an uninvoiced period is a customer nobody asked. Telling an admin the
 * second one is "currently failing" sends them to the payments screen, where
 * there is nothing to find.
 */
const ATTENTION_SUBTITLES: Record<string, { clear: string; action: string }> = {
  payments_failed: {
    clear: 'Nothing needs attention.',
    action: 'Currently failing — open to reconcile.',
  },
  uninvoiced_periods: {
    clear: 'Every live subscription has been invoiced for its current period.',
    action: 'These salons are not being billed — check a tax rule covers their period.',
  },
};

function AttentionRowView({ row, isLast }: { row: AttentionRow; isLast: boolean }) {
  const body = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '12px 0',
        borderBottom: isLast ? 'none' : `1px solid ${oklch.divider}`,
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: row.available ? 'oklch(0.95 0.04 25)' : 'oklch(0.96 0.006 150)',
          color: row.available ? 'oklch(0.5 0.14 25)' : oklch.textFaint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        }}
      >
        <Icon name="alert" size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: row.available ? oklch.textStrong : oklch.textMuted }}>{row.label}</div>
        <div style={{ fontSize: 12.5, color: oklch.textFaint, marginTop: 2 }}>
          {row.available
            ? // A count on its own read as a stray number in the subtitle
              // slot. Say what it means, and — for the zero case — say it is
              // a real zero rather than a row that has nothing behind it,
              // which is the distinction BR-01 turns on.
              //
              // GRW-167 — per row, not one sentence for all of them. "Currently
              // failing" is true of a declined payment and wrong about an
              // invoice that was never raised: nothing failed there, nobody was
              // asked. An admin who reads the wrong noun goes to the wrong
              // screen, and this tile exists because that salon is invisible
              // everywhere else.
              ATTENTION_SUBTITLES[row.key]?.[row.count === 0 ? 'clear' : 'action'] ??
              (row.count === 0 ? 'Nothing needs attention.' : 'Currently failing — open to reconcile.')
            : `Not yet available — lands with Jira ${row.epic}.`}
        </div>
      </div>
      {row.available ? (
        <span
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: row.count === 0 ? oklch.textFaint : 'oklch(0.5 0.14 25)',
          }}
        >
          {row.count}
        </span>
      ) : null}
    </div>
  );

  // An available row links to the list it counted; an unavailable one has
  // nowhere to go and stays inert rather than looking clickable.
  return row.available && row.href ? (
    <Link href={row.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {body}
    </Link>
  ) : (
    body
  );
}
