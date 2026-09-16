'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Card, SecondaryButton } from '../components/primitives';
import { oklch } from '../tokens';
import { Panel, RangePicker, StatTile, Bars, Freshness, type Monitoring, type Range } from './parts';

/**
 * Jira GRW-279 — is the platform's machinery running.
 *
 * ## When this calls the API
 *
 * On mount, on Refresh, and on a range change. That is the whole list. No
 * timer, no polling, no window-focus listener, and nothing on any other screen
 * fetches this — BR-06, and it is the reason the processed-over-time query is
 * allowed to be as expensive as it is. `outbox_event`'s pre-existing index is
 * partial on the NULLs, so reading the non-null side is a sequential scan;
 * acceptable when a person opens a diagnostic screen, unacceptable on every
 * dashboard load.
 *
 * The cost of that rule is that the figures go stale silently while somebody
 * sits here, and on a HEALTH screen that is the most dangerous staleness there
 * is — "last drained: 2 min ago" is exactly the number they would act on. So
 * the header ages itself client-side (`Freshness`), which costs no network at
 * all: a `setInterval` that re-renders a string is not a `setInterval` that
 * fetches.
 */
export default function NetworkMonitoringPage() {
  const [range, setRange] = useState<Range>('24h');
  const [data, setData] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    /*
     * `AbortController`, not the `cancelled` boolean the other admin screens
     * use. Theirs stops React setting state after unmount but lets the request
     * run to completion, which is harmless on a list and is not harmless here:
     * navigating away mid-load would leave the database finishing a sequential
     * scan for a screen nobody is looking at.
     */
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    adminFetch<Monitoring>(`/network-monitoring?range=${range}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof AdminApiError ? err.message : 'Could not read the platform’s health.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range, reloadToken]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
          <SecondaryButton onClick={refresh}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="admin-monitor-bar">
        <Freshness readAt={data?.readAt ?? null} />
        <div className="admin-monitor-controls">
          <RangePicker value={range} onChange={setRange} disabled={loading} />
          <SecondaryButton onClick={refresh}>Refresh</SecondaryButton>
        </div>
      </div>

      {loading && !data ? (
        <>
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <div style={{ height: 120, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
            </Card>
          ))}
        </>
      ) : data ? (
        <>
          <Panel
            title="Worker and queue"
            status={
              data.worker.alive
                ? { tone: 'good', text: 'Running' }
                : { tone: 'bad', text: data.worker.lastBeatAt === null ? 'Never started' : 'Not running' }
            }
          >
            <div className="admin-stat-grid admin-monitor-grid">
              <StatTile
                live
                label="Last drained"
                /* "never" is not "a long time ago". One is a database that has
                   never had a worker — a fresh install, not an incident — and
                   the other is a worker that stopped. */
                value={data.worker.lastBeatAt === null ? 'never' : relative(data.worker.beatAgeSeconds)}
                bad={!data.worker.alive}
              />
              <StatTile live label="Pending" value={data.worker.pending.toLocaleString('en-IN')} />
              <StatTile
                live
                label="Oldest waiting"
                value={data.worker.oldestPendingSeconds === null ? '—' : relative(data.worker.oldestPendingSeconds)}
              />
              <StatTile
                live
                label="Failing"
                value={data.worker.failing.toLocaleString('en-IN')}
                bad={data.worker.failing > 0}
                note={data.worker.givenUp > 0 ? `${data.worker.givenUp} given up` : undefined}
              />
            </div>
            <Bars
              buckets={data.worker.processed}
              caption={`${data.worker.processedTotal.toLocaleString('en-IN')} processed in ${RANGE_WORDS[data.range]}`}
            />
          </Panel>

          <Panel
            title="Payment webhooks"
            status={
              data.webhooks.pendingNow > 0
                ? { tone: 'warn', text: `${data.webhooks.pendingNow} stuck` }
                : { tone: 'good', text: 'Clear' }
            }
            windowed={RANGE_WORDS[data.range]}
          >
            <div className="admin-stat-grid admin-monitor-grid">
              <StatTile label="Received" value={data.webhooks.received.toLocaleString('en-IN')} />
              <StatTile label="Failed" value={data.webhooks.failed.toLocaleString('en-IN')} bad={data.webhooks.failed > 0} />
              <StatTile live label="Pending now" value={data.webhooks.pendingNow.toLocaleString('en-IN')} bad={data.webhooks.pendingNow > 0} />
              <StatTile
                live
                label="Oldest pending"
                value={data.webhooks.oldestPendingSeconds === null ? '—' : relative(data.webhooks.oldestPendingSeconds)}
              />
            </div>
          </Panel>

          <Panel
            title="Billing retries"
            status={data.dunning.inRetryNow > 0 ? { tone: 'warn', text: `${data.dunning.inRetryNow} in retry` } : { tone: 'good', text: 'None in retry' }}
            windowed={RANGE_WORDS[data.range]}
          >
            {data.dunning.outcomes.length === 0 ? (
              <div style={{ fontSize: 13, color: oklch.textFaint }}>No retries attempted in {RANGE_WORDS[data.range]}.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.dunning.outcomes.map((row, i) => (
                  <div
                    key={row.outcome}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      fontSize: 13,
                      borderBottom: i === data.dunning.outcomes.length - 1 ? 'none' : `1px solid ${oklch.divider}`,
                    }}
                  >
                    <span style={{ color: oklch.textMuted }}>{OUTCOME_WORDS[row.outcome] ?? row.outcome}</span>
                    <span style={{ fontWeight: 800, color: row.outcome === 'not_made' ? 'oklch(0.55 0.13 65)' : oklch.textStrong }}>
                      {row.count.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* BR-02 — present, and honest about being empty. A zero here would
              read as "nobody is near their limit", which is a much more
              comforting claim than "nothing has been built to check". */}
          <Card style={{ borderStyle: 'dashed' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: oklch.textMuted }}>Businesses near their limits</h3>
            <div style={{ fontSize: 13, color: oklch.textFaint }}>Not yet available — lands with Jira {data.limits.epic}.</div>
          </Card>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: oklch.textFaint, padding: '0 2px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.55 0.13 150)', flex: 'none' }} />
            <span>A green dot marks a figure that is current state — the range above never affects it.</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

const RANGE_WORDS: Record<Range, string> = { '24h': 'the last 24 hours', '7d': 'the last 7 days', '30d': 'the last 30 days' };

/**
 * GRW-167's lesson, applied to `dunning_attempt`: say what the row MEANS.
 *
 * `not_made` is the one that matters. It means the provider could not be
 * reached — so nothing was declined, nobody's card was refused, and no retry
 * should have been consumed from their budget. An admin who reads it as
 * "failed" goes looking for a customer problem that does not exist.
 */
const OUTCOME_WORDS: Record<string, string> = {
  charged: 'Charged',
  declined: 'Declined',
  not_made: 'Not made — provider unreachable',
  skipped: 'Skipped',
};

/** Whole units, largest that fits. "41 min" is what somebody reads; "2,460 s" is not. */
function relative(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}
