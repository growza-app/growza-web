'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Card } from '../components/primitives';
import { oklch } from '../tokens';

/**
 * Jira GRW-279 — the Network monitoring screen's own small components.
 *
 * Split out of `page.tsx` for the same reason the dashboard's were: pieces used
 * nowhere but one screen, kept beside it rather than promoted to a shared
 * primitive they are not, and the page file stays under the repo's 400-line
 * lint limit.
 */

export type Range = '24h' | '7d' | '30d';

export interface Bucket {
  /** Already formatted by the server — this file parses no dates. */
  label: string;
  count: number;
}

export interface Monitoring {
  range: Range;
  readAt: string;
  worker: {
    lastBeatAt: string | null;
    beatAgeSeconds: number | null;
    alive: boolean;
    staleAfterSeconds: number;
    pending: number;
    oldestPendingSeconds: number | null;
    failing: number;
    givenUp: number;
    processed: Bucket[];
    processedTotal: number;
  };
  webhooks: { received: number; failed: number; ignored: number; pendingNow: number; oldestPendingSeconds: number | null };
  dunning: { outcomes: Array<{ outcome: string; count: number }>; inRetryNow: number };
  limits: { available: false; epic: string };
}

const TONES = {
  good: { fg: 'oklch(0.42 0.11 150)', bg: 'oklch(0.94 0.04 150)' },
  warn: { fg: 'oklch(0.45 0.12 65)', bg: 'oklch(0.95 0.05 75)' },
  bad: { fg: 'oklch(0.48 0.16 25)', bg: 'oklch(0.94 0.04 25)' },
} as const;

export function Panel({
  title,
  status,
  windowed,
  children,
}: {
  title: string;
  status: { tone: keyof typeof TONES; text: string };
  /** Present when this panel's figures are bounded by the selected range. */
  windowed?: string;
  children: ReactNode;
}) {
  const tone = TONES[status.tone];
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>{title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Says so on the panel, not only in a legend: a reader who has just
              changed the range needs to know which panels moved. */}
          {windowed ? (
            <span style={{ fontSize: 11, color: oklch.textFaint, border: `1px solid ${oklch.border}`, borderRadius: 8, padding: '2px 8px' }}>
              {windowed}
            </span>
          ) : null}
          <span style={{ fontSize: 12, fontWeight: 700, color: tone.fg, background: tone.bg, borderRadius: 8, padding: '3px 10px' }}>
            {status.text}
          </span>
        </div>
      </div>
      {children}
    </Card>
  );
}

/**
 * `live` is the load-bearing prop on this screen.
 *
 * A figure is windowed only if it counts something that HAPPENED. Anything
 * counting something still TRUE — the queue depth, the last beat, retries in
 * flight — is current state, and marking it is what stops a 30-day selection
 * making "Pending: 3" read as history.
 */
export function StatTile({
  label,
  value,
  live = false,
  bad = false,
  note,
}: {
  label: string;
  value: string;
  live?: boolean;
  bad?: boolean;
  note?: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: oklch.surfaceSubtle,
        borderRadius: 12,
        padding: 12,
        minWidth: 0,
      }}
    >
      {live ? (
        <span
          aria-label="Current state — not affected by the selected range"
          title="Current state — not affected by the selected range"
          style={{ position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.55 0.13 150)' }}
        />
      ) : null}
      <div style={{ fontSize: 11.5, color: oklch.textMuted, fontWeight: 500, paddingRight: live ? 14 : 0, overflowWrap: 'anywhere' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, marginTop: 3, color: bad ? 'oklch(0.48 0.16 25)' : oklch.textStrong }}>
        {value}
      </div>
      {note ? <div style={{ fontSize: 11, color: oklch.textFaint, marginTop: 2 }}>{note}</div> : null}
    </div>
  );
}

export function RangePicker({ value, onChange, disabled }: { value: Range; onChange: (r: Range) => void; disabled?: boolean }) {
  return (
    <div className="admin-range-picker" role="group" aria-label="Time range">
      {(['24h', '7d', '30d'] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          disabled={disabled}
          aria-pressed={value === r}
          data-active={value === r ? 'true' : undefined}
        >
          {r === '24h' ? '24 hours' : r === '7d' ? '7 days' : '30 days'}
        </button>
      ))}
    </div>
  );
}

/**
 * The chart, and the most useful control on the screen.
 *
 * A worker that died at 03:00 shows as bars stopping at 03:00 — the cliff is
 * readable at a glance in a way no single figure is, and the time of death can
 * be read off the axis. Which is why the series is zero-filled server-side: a
 * shorter chart would hide exactly that.
 *
 * Hand-drawn divs, no chart library. This repo has none anywhere, and 24 bars
 * do not justify becoming the first place that changes.
 */
export function Bars({ buckets, caption }: { buckets: Bucket[]; caption: string }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64 }}>
        {buckets.map((b) => (
          <div
            key={b.label}
            title={`${b.label}: ${b.count.toLocaleString('en-IN')}`}
            style={{
              flex: 1,
              minWidth: 0,
              height: Math.max(2, Math.round((b.count / max) * 64)),
              borderRadius: '3px 3px 0 0',
              // A zero bar is drawn as a visible stub in a flat tone rather
              // than omitted: the gap IS the signal on this screen, and an
              // absent bar reads as a rendering fault.
              background: b.count === 0 ? oklch.border : 'oklch(0.62 0.12 150)',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: oklch.textFaint, marginTop: 5 }}>
        <span>{buckets[0]?.label ?? ''}</span>
        <span>{caption}</span>
        <span>now</span>
      </div>
    </div>
  );
}

/**
 * How old these figures are, ageing live — and costing nothing to do it.
 *
 * BR-06 forbids background READS, not a re-render. This ticks a string that is
 * already in state; nothing touches the network. Without it the screen would
 * still read "last drained: 2 min ago" forty minutes later, which on a health
 * screen is the most dangerous staleness there is — it is the exact number
 * somebody would act on.
 */
export function Freshness({ readAt }: { readAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  if (!readAt) return <span style={{ fontSize: 12, color: oklch.textFaint }}>Reading…</span>;

  const ageMs = now - new Date(readAt).getTime();
  const minutes = Math.floor(ageMs / 60_000);
  const clock = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(readAt));

  if (minutes >= 15) {
    return (
      <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.5 0.13 65)' }}>
        Figures are {minutes} minutes old — refresh
      </span>
    );
  }
  return (
    <span style={{ fontSize: 12, color: oklch.textFaint }}>
      as of {clock}
      {minutes >= 2 ? ` · ${minutes} minutes ago` : ''}
    </span>
  );
}
