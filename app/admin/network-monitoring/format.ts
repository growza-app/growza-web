/**
 * Jira GRW-286 — the Network monitoring screen's words and decisions, kept
 * free of React so they can be tested as plain functions.
 *
 * Every rule here is one QA found wrong on the screen itself: the worker pill
 * that turned a brand-new platform red, the relative times with no absolute
 * time behind them, and the retry outcome that rendered as its raw database
 * value.
 */

import type { DunningSkipReason } from '@growza-app/shared';

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
 * **Jira GRW-413 — four of these five can no longer be written.** Dunning asks
 * the payment provider for nothing, so nothing charges, declines, fails to reach
 * it or waits on an answer; every new row is `skipped`, and which KIND of skipped
 * is `SKIP_REASON_WORDS` below. The four are kept because the rows are still in
 * the table and an admin reading a 90-day window will see them — a label that
 * disappeared would render as a raw code on historic data.
 */
export const OUTCOME_WORDS: Record<string, string> = {
  charged: 'Charged (before Sep 2026)',
  declined: 'Declined (before Sep 2026)',
  not_made: 'Not made — provider unreachable (before Sep 2026)',
  skipped: 'Not collected',
  in_flight: 'Waiting for the result (before Sep 2026)',
};

/**
 * Jira GRW-413 — WHY billing collected nothing, in the words an admin needs.
 *
 * Keyed on `DunningSkipReason` itself, so a reason added to the shared list
 * cannot ship without a word for it — the compiler refuses. A row with no code
 * (anything written before migration 0093) falls back to its outcome word, which
 * is what the screen already did.
 *
 * `bad` marks the one an admin should act on: a halted AutoPay recovers only if
 * the owner re-approves it or pays by link, and nothing chases them but the
 * dashboard.
 */
export const SKIP_REASON_WORDS: Record<DunningSkipReason, { label: string; bad?: boolean }> = {
  autopay_halted: { label: 'AutoPay halted — owner asked to re-approve or pay by link', bad: true },
  autopay_live: { label: 'AutoPay is live — the provider debits it on its own cycle' },
  autopay_not_active: { label: 'AutoPay paused or stopped by the owner — payment expected by link' },
  no_autopay: { label: 'No AutoPay set up — payment expected by link' },
  first_debit_not_due: { label: 'AutoPay approved; its first debit is still ahead' },
  online_payments_off: { label: 'Online payments off for this business — paying offline' },
};

/** The row's own words: the reason when it has one, else the outcome it was recorded as. */
export function attemptWords(outcome: string, skipReason: string | null): { label: string; bad?: boolean } {
  if (skipReason !== null) {
    // A code the migration's CHECK cannot produce today, but a later one could
    // while forgetting this map: it shows as itself, which is ugly and
    // unmistakably a gap (the rule `billingStatusLabel` already records). Never
    // the outcome word, which would hide the new reason among the old ones.
    return SKIP_REASON_WORDS[skipReason as DunningSkipReason] ?? { label: skipReason };
  }
  // No code: a row written before migration 0093. It reads as what it was.
  return { label: OUTCOME_WORDS[outcome] ?? outcome, bad: outcome === 'not_made' };
}

/** The panels the screen draws — one skeleton each while loading. */
export const PANEL_COUNT = 4;
