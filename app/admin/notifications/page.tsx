'use client';

import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Card, EmptyState, SecondaryButton } from '../components/primitives';
import { AttentionRowView, type AttentionRow } from '../components/DashboardParts';
import { oklch } from '../tokens';

/**
 * Jira GRW-299 — admin mobile's own Notifications page.
 *
 * The header bell (NotificationBell.tsx) is a popover — fine on a laptop
 * beside a permanent sidebar, cramped on a phone where it has to fit inside
 * an already-tight header row. This is the same `/dashboard` attention
 * registry as a full page instead, reached from its own bottom-bar tab
 * (AdminShell.tsx) rather than the header, with a back button rather than a
 * dismiss-on-outside-click panel.
 *
 * Reads every row `AttentionRowView` already knows how to draw — including an
 * unavailable one's honest "not yet available" state (the dashboard's own
 * "Billing attention" card, page.tsx, renders the identical list the same
 * way) — rather than the bell's own narrower "only what's live" filter, so
 * "all the notifications" means all of them, not just the ones currently
 * non-zero.
 */
export default function AdminNotificationsPage() {
  const [attention, setAttention] = useState<AttentionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminFetch<{ attention: AttentionRow[] }>('/dashboard')
      .then((result) => {
        if (!cancelled) setAttention(result.attention);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof AdminApiError ? err.message : 'Could not load notifications.');
      });
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
          <SecondaryButton onClick={() => setRetryCount((n) => n + 1)}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  if (!attention) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ height: 56, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
          ))}
        </div>
      </Card>
    );
  }

  return attention.length === 0 ? (
    <EmptyState icon="bell" title="Nothing to show" sub="Notifications will appear here as they come up." />
  ) : (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {attention.map((row, i) => (
          <AttentionRowView key={row.key} row={row} isLast={i === attention.length - 1} />
        ))}
      </div>
    </Card>
  );
}
