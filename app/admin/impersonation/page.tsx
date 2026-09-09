'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Icon } from '../icons';
import { Card, EmptyState, Pill, PrimaryButton, SecondaryButton, SectionTitle } from '../components/primitives';
import { oklch } from '../tokens';

/**
 * Jira GRW-90 · GRW-137 — the Impersonation screen, no longer a mock.
 *
 * Starting a session happens from a business's own detail page ("Impersonate
 * owner"); this screen is the entry point and the log. The log is the point:
 * §7's "never silent" means an admin looking at a customer's account leaves a
 * record any other admin can read, without going through the audit log's
 * filters to find it.
 */
interface SessionRow {
  id: string;
  adminName: string | null;
  adminPhone: string | null;
  tenantId: string;
  businessName: string;
  targetPhone: string | null;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  endedReason: string | null;
}

/** How long it ran, or how long it has been running. Whole minutes — a support session is not timed to the second. */
function duration(row: SessionRow): string {
  const from = new Date(row.startedAt).getTime();
  const to = row.endedAt ? new Date(row.endedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((to - from) / 60000));
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function AdminImpersonationPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminFetch<{ rows: SessionRow[] }>('/impersonation')
      .then((res) => {
        if (!cancelled) setRows(res.rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof AdminApiError ? err.message : 'Could not load impersonation sessions.');
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: oklch.dangerBg,
              color: 'oklch(0.5 0.16 25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Icon name="impersonate" size={20} />
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: oklch.textStrong }}>Start a session from a business</div>
            <div style={{ fontSize: 13, color: oklch.textMuted, marginTop: 2 }}>
              Open the business and choose “Impersonate owner”. A reason is required, the session is read-only, and it
              ends after 30 minutes or when you exit.
            </div>
          </div>
          <PrimaryButton onClick={() => router.push('/admin/businesses')} style={{ marginLeft: 'auto' }}>
            Go to businesses
          </PrimaryButton>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Recent sessions" />
        {error ? (
          <div style={{ textAlign: 'center', padding: '20px 12px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
            <SecondaryButton onClick={() => setRetryToken((n) => n + 1)}>Retry</SecondaryButton>
          </div>
        ) : rows === null ? (
          <div style={{ height: 120, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="impersonate"
            title="No sessions yet"
            sub="Nobody has viewed a business as its owner. When someone does, it will be listed here with their name and their reason."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((row, i) => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 12,
                  alignItems: 'center',
                  padding: '13px 0',
                  borderBottom: i < rows.length - 1 ? `1px solid ${oklch.divider}` : 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>
                    {row.businessName} · {row.targetPhone ?? '—'}
                  </div>
                  <div style={{ fontSize: 12, color: oklch.textFaint }}>by {row.adminName ?? row.adminPhone ?? '—'}</div>
                </div>
                {/* The reason, at the same weight as everything else. It is the
                    field that makes the row reviewable, so it is not a tooltip. */}
                <div style={{ fontSize: 13, color: 'oklch(0.45 0.02 155)', fontWeight: 600 }}>{row.reason}</div>
                <div style={{ fontSize: 13, color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{duration(row)}</div>
                <div>
                  {row.endedAt === null ? (
                    <Pill text="Active now" fg="oklch(0.5 0.16 25)" bg={oklch.dangerBg} />
                  ) : (
                    <span style={{ fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>
                      {formatDateTime(row.startedAt)}
                      {row.endedReason === 'expired' ? ' · timed out' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
