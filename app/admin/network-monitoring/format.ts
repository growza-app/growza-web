/**
 * Jira GRW-286 — the Network monitoring screen's words and decisions, kept
 * free of React so they can be tested as plain functions.
 *
 * Every rule here is one QA found wrong on the screen itself: the worker pill
 * that turned a brand-new platform red, the relative times with no absolute
 * time behind them, and the retry outcome that rendered as its raw database
 * value.
 */

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface WorkerFacts {
  lastProcessedSeconds: number | null;
  lastBeatAt: string | null;
  beatAgeSeconds: number | null;
  alive: boolean;
}

/** Whole units, largest that fits. "41 min" is what somebody reads; "2,460 s" is not. */
export function relative(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * The absolute time behind a relative one, for its hover title — GRW-279's
 * UI requirement, missing from the first cut.
 *
 * Always IST, whatever zone the admin's laptop is in: every other time in this
 * product is the business's time, and "12:04" meaning a different instant on
 * two admins' screens is how two people disagree about when the worker died.
 *
 * `secondsAgo` is measured from `readAt`, not from the browser's clock — the
 * server read both figures in the same instant, and the page may have been
 * open for an hour since.
 */
export function absoluteIst(readAt: string, secondsAgo: number | null): string | undefined {
  if (secondsAgo === null) return undefined;
  const at = new Date(Date.parse(readAt) - secondsAgo * 1000);
  if (Number.isNaN(at.getTime())) return undefined;
  return `${IST.format(at)} IST`;
}

/**
 * The worker panel's pill.
 *
 * AC-04 — no heartbeat ever is NEUTRAL. It is what a freshly migrated database
 * looks like, and the first cut drew it as a red "Never started" incident. A
 * heartbeat that exists and has gone stale is the incident, and stays red.
 */
export function workerStatus(w: WorkerFacts): { tone: Tone; text: string } {
  if (w.lastBeatAt === null) return { tone: 'neutral', text: 'Nothing yet' };
  return w.alive ? { tone: 'good', text: 'Running' } : { tone: 'bad', text: 'Not running' };
}

/**
 * "Last drained" — the last processed outbox row (FR-01), with the heartbeat
 * underneath as its own figure.
 *
 * GRW-286: the tile used to show the heartbeat's age, so a worker that beat 8
 * seconds ago but had processed nothing for two minutes read "8s". Now the
 * big number is the work, and the note says whether the process is beating.
 *
 * Red only when a worker that HAS beaten has stopped. "never" on its own is a
 * platform nothing has happened on yet, not an outage.
 */
export function lastDrainedTile(w: WorkerFacts): { value: string; bad: boolean; note: string } {
  const heartbeat = w.lastBeatAt === null ? 'No heartbeat yet' : `Heartbeat ${relative(w.beatAgeSeconds)} ago`;
  if (w.lastProcessedSeconds === null) {
    return { value: 'never', bad: false, note: `Nothing processed yet · ${heartbeat}` };
  }
  return { value: relative(w.lastProcessedSeconds), bad: w.lastBeatAt !== null && !w.alive, note: heartbeat };
}

/**
 * GRW-167's lesson, applied to `dunning_attempt`: say what the row MEANS.
 *
 * `not_made` is the one that matters. It means the provider could not be
 * reached — so nothing was declined, nobody's card was refused, and no retry
 * should have been consumed from their budget. An admin who reads it as
 * "failed" goes looking for a customer problem that does not exist.
 *
 * `in_flight` (migration 0032) had no entry and rendered as its raw value. It
 * is a charge that was requested and whose result has not come back — and it
 * DOES use up a retry, because it may well have charged the customer.
 */
export const OUTCOME_WORDS: Record<string, string> = {
  charged: 'Charged',
  declined: 'Declined',
  not_made: 'Not made — provider unreachable',
  skipped: 'Skipped',
  in_flight: 'Waiting for the result',
};

/** The panels the screen draws — one skeleton each while loading. */
export const PANEL_COUNT = 4;
