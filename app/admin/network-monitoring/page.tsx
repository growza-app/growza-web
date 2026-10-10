'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Card, SecondaryButton } from '../components/primitives';
import { oklch } from '../tokens';
import { Panel, PanelFailure, RangePicker, StatTile, Bars, Freshness, type Monitoring, type Range } from './parts';
import { absoluteIst, attemptWords, lastDrainedTile, PANEL_COUNT, relative, workerStatus } from './format';

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
 *
 * ## When a panel fails
 *
 * GRW-286 — each panel arrives as its data or its own error. A failed panel is
 * drawn as `PanelFailure` in its own place, with Retry, and every other panel
 * renders as normal: a health screen that blanks entirely because one query
 * failed is useless on exactly the day it is needed. Only a failure of the
 * request ITSELF — the API unreachable — replaces the screen with one error,
 * because then there are no figures at all and old ones must not pass as
 * current.
 */
export default function NetworkMonitoringPage() {
  const [range, setRange] = useState<Range>('24h');
  const [data, setData] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // QA — a permission refusal is not a transient error. See the render below.
  const [noAccess, setNoAccess] = useState(false);
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
    setNoAccess(false);

    adminFetch<Monitoring>(`/network-monitoring?range=${range}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        /*
         * QA — a 403 used to fall into the ordinary error branch below, which
         * offers a Retry button. Retrying a permission refusal asks the same
         * question and gets the same answer every time; the control was
         * there because every OTHER failure on this screen is worth a retry,
         * and this one condition got swept in with them. `admin.system.view`
         * is not the kind of thing that resolves itself between one click
         * and the next, so this is the plain "you can't be here" GRW-171
         * already established for the dashboard, not a dead button.
         */
        if (err instanceof AdminApiError && err.status === 403) {
          setNoAccess(true);
          return;
        }
        setError(err instanceof AdminApiError ? err.message : 'Could not read the platform’s health.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range, reloadToken]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  if (noAccess) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 6 }}>Your role does not open this screen</div>
          <div style={{ fontSize: 13, color: oklch.textMuted }}>
            Ask a Super Admin to add platform-health access to it. Retrying will not change this.
          </div>
        </div>
      </Card>
    );
  }

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
        <Freshness readAt={data?.readAt ?? null} staleAfterMinutes={data?.figuresStaleAfterMinutes ?? Number.POSITIVE_INFINITY} />
        <div className="admin-monitor-controls">
          {/*
            QA GRW-279 — not disabled while loading.
            It was: `disabled={loading}` meant a range click that landed while
            the previous range's request was still in flight did nothing at
            all — no request, no visual change, no error. A user who clicked
            7 days and then, mid-load, changed their mind to 30 days had that
            second click silently swallowed by a disabled button; the screen
            settled on 7 days and never said why.

            Safe to leave enabled: the effect above already keys off `range`
            with its own `AbortController`, so a second click aborts the
            first request in flight and starts a fresh one — "last click
            wins" was already the architecture, `disabled` was the only thing
            stopping it from working.
          */}
          <RangePicker value={range} onChange={setRange} />
          <SecondaryButton onClick={refresh}>Refresh</SecondaryButton>
        </div>
      </div>

      {loading && !data ? (
        <>
          {/* One skeleton per panel the screen draws — GRW-279's UI states. */}
          {Array.from({ length: PANEL_COUNT }, (_, i) => (
            <Card key={i}>
              <div style={{ height: 120, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
            </Card>
          ))}
        </>
      ) : data ? (
        <>
          <WorkerSection data={data} onRetry={refresh} loading={loading} />
          <WebhookSection data={data} onRetry={refresh} loading={loading} />
          <DunningSection data={data} onRetry={refresh} loading={loading} />

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

interface SectionProps {
  data: Monitoring;
  onRetry: () => void;
  loading: boolean;
}

function WorkerSection({ data, onRetry, loading }: SectionProps) {
  const title = 'Worker and queue';
  if (!data.worker.ok) return <PanelFailure title={title} error={data.worker.error} onRetry={onRetry} disabled={loading} />;
  const w = data.worker.data;
  /* "never" is not "a long time ago". One is a platform nothing has been
     processed on yet — a fresh install, not an incident (AC-04) — and the
     other is a worker that stopped. */
  const drained = lastDrainedTile(w);
  return (
    <Panel title={title} status={workerStatus(w)}>
      <div className="admin-stat-grid admin-monitor-grid">
        <StatTile
          live
          label="Last drained"
          value={drained.value}
          bad={drained.bad}
          note={drained.note}
          title={absoluteIst(data.readAt, w.lastProcessedSeconds)}
        />
        <StatTile live label="Pending" value={w.pending.toLocaleString('en-IN')} />
        <StatTile live label="Oldest waiting" value={relative(w.oldestPendingSeconds)} title={absoluteIst(data.readAt, w.oldestPendingSeconds)} />
        <StatTile
          live
          label="Failing"
          value={w.failing.toLocaleString('en-IN')}
          // Audit M12 — given-up rows are no longer counted as failing (nor as pending), so they need the red here
          // themselves: nothing will retry them, which makes them the worse of the two.
          bad={w.failing > 0 || w.givenUp > 0}
          note={w.givenUp > 0 ? `${w.givenUp} given up — will not be retried` : undefined}
        />
      </div>
      <Bars buckets={w.processed} caption={`${w.processedTotal.toLocaleString('en-IN')} processed in ${RANGE_WORDS[data.range]}`} />
    </Panel>
  );
}

function WebhookSection({ data, onRetry, loading }: SectionProps) {
  const title = 'Payment webhooks';
  if (!data.webhooks.ok) return <PanelFailure title={title} error={data.webhooks.error} onRetry={onRetry} disabled={loading} />;
  const h = data.webhooks.data;
  return (
    <Panel
      title={title}
      status={h.pendingNow > 0 ? { tone: 'warn', text: `${h.pendingNow} stuck` } : { tone: 'good', text: 'Clear' }}
      windowed={RANGE_WORDS[data.range]}
    >
      <div className="admin-stat-grid admin-monitor-grid">
        <StatTile label="Received" value={h.received.toLocaleString('en-IN')} />
        <StatTile label="Failed" value={h.failed.toLocaleString('en-IN')} bad={h.failed > 0} />
        <StatTile live label="Pending now" value={h.pendingNow.toLocaleString('en-IN')} bad={h.pendingNow > 0} />
        <StatTile live label="Oldest pending" value={relative(h.oldestPendingSeconds)} title={absoluteIst(data.readAt, h.oldestPendingSeconds)} />
      </div>
    </Panel>
  );
}

/**
 * Jira GRW-413 — "Billing chasing", not "Billing retries".
 *
 * Nothing retries anything: dunning asks the payment provider for nothing, and a
 * halted AutoPay recovers only when the owner re-approves it or pays by link. The
 * panel used to read "Billing retries — 12 in retry" over a single bar labelled
 * "Skipped", which is the screen built to answer "is billing doing anything about
 * the money" answering it wrongly. Each row is now WHY nothing was collected.
 */
function DunningSection({ data, onRetry, loading }: SectionProps) {
  const title = 'Billing chasing';
  if (!data.dunning.ok) return <PanelFailure title={title} error={data.dunning.error} onRetry={onRetry} disabled={loading} />;
  const d = data.dunning.data;
  return (
    <Panel
      title={title}
      status={
        d.inDunningNow > 0
          ? { tone: 'warn', text: `${d.inDunningNow} unpaid` }
          : { tone: 'good', text: 'None unpaid' }
      }
      windowed={RANGE_WORDS[data.range]}
    >
      {d.outcomes.length === 0 ? (
        <div style={{ fontSize: 13, color: oklch.textFaint }}>Billing looked at nobody in {RANGE_WORDS[data.range]}.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {d.outcomes.map((row, i) => {
            const words = attemptWords(row.outcome, row.skipReason);
            return (
              <div
                key={`${row.outcome}:${row.skipReason ?? ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  fontSize: 13,
                  borderBottom: i === d.outcomes.length - 1 ? 'none' : `1px solid ${oklch.divider}`,
                }}
              >
                <span style={{ color: oklch.textMuted, minWidth: 0 }}>{words.label}</span>
                <span style={{ fontWeight: 800, flex: 'none', color: words.bad ? 'oklch(0.55 0.13 65)' : oklch.textStrong }}>
                  {row.count.toLocaleString('en-IN')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
