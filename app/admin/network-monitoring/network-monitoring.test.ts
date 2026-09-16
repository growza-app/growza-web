import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { absoluteIst, lastDrainedTile, OUTCOME_WORDS, PANEL_COUNT, workerStatus } from './format';

/**
 * Jira GRW-286 — the Network monitoring screen's states, as QA found them
 * wrong on GRW-279.
 *
 * There is no component harness in this repo, so the decisions live in
 * `format.ts` as plain functions and are tested here; the wiring that a
 * refactor could quietly undo is pinned by reading the source, the same way
 * the other admin layout tests do.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(here, 'page.tsx'), 'utf-8');
const parts = readFileSync(path.join(here, 'parts.tsx'), 'utf-8');

const healthy = { lastProcessedSeconds: 120, lastBeatAt: '2026-09-16T08:00:00.000Z', beatAgeSeconds: 8, alive: true };

describe('AC-04 — a platform where nothing has happened yet is not an incident', () => {
  it('shows a neutral pill, not a red "Never started"', () => {
    expect(workerStatus({ lastProcessedSeconds: null, lastBeatAt: null, beatAgeSeconds: null, alive: false })).toEqual({
      tone: 'neutral',
      text: 'Nothing yet',
    });
  });

  it('reads "never" for last drained, not in red, and says nothing has been processed', () => {
    const tile = lastDrainedTile({ lastProcessedSeconds: null, lastBeatAt: null, beatAgeSeconds: null, alive: false });
    expect(tile).toMatchObject({ value: 'never', bad: false });
    expect(tile.note).toContain('Nothing processed yet');
  });

  it('negative — a worker that HAS beaten and stopped is still red', () => {
    const stopped = { ...healthy, beatAgeSeconds: 600, alive: false };
    expect(workerStatus(stopped)).toEqual({ tone: 'bad', text: 'Not running' });
    expect(lastDrainedTile(stopped).bad).toBe(true);
  });
});

describe('FR-01 — last drained is the work, the heartbeat is its own figure', () => {
  it('shows two minutes for the last processed row while the heartbeat was 8s ago', () => {
    const tile = lastDrainedTile(healthy);
    expect(tile).toEqual({ value: '2 min', bad: false, note: 'Heartbeat 8s ago' });
    expect(workerStatus(healthy)).toEqual({ tone: 'good', text: 'Running' });
  });

  it('the page reads lastProcessedSeconds for the tile, not beatAgeSeconds', () => {
    expect(page).toContain('lastDrainedTile(w)');
    expect(page).toContain('absoluteIst(data.readAt, w.lastProcessedSeconds)');
  });
});

describe('relative times carry their absolute IST time on hover', () => {
  it('formats the instant the server read, minus the age, in IST', () => {
    // 08:00:00Z is 13:30:00 IST; two minutes earlier is 13:28:00.
    const title = absoluteIst('2026-09-16T08:00:00.000Z', 120)!;
    expect(title).toMatch(/13:28:00/);
    expect(title).toMatch(/IST$/);
  });

  it('has no title when there is no time to show', () => {
    expect(absoluteIst('2026-09-16T08:00:00.000Z', null)).toBeUndefined();
  });

  it('every relative tile on the page passes one', () => {
    for (const figure of ['w.lastProcessedSeconds', 'w.oldestPendingSeconds', 'h.oldestPendingSeconds']) {
      expect(page).toContain(`absoluteIst(data.readAt, ${figure})`);
    }
    expect(parts).toMatch(/<div title=\{title\}/);
  });
});

describe('error handling — one failed panel does not blank the screen', () => {
  it('each data panel has its own failure state with Retry', () => {
    for (const panel of ['worker', 'webhooks', 'dunning']) {
      expect(page).toContain(`if (!data.${panel}.ok) return <PanelFailure`);
    }
    expect(parts).toContain('export function PanelFailure');
    expect(parts).toMatch(/PanelFailure[\s\S]*Retry/);
  });
});

describe('loading — one skeleton per panel', () => {
  it('draws as many skeletons as the screen has panels', () => {
    // Worker, webhooks, billing retries, and the limits card.
    expect(PANEL_COUNT).toBe(4);
    const cards = page.slice(page.indexOf('<WorkerSection')).match(/<(WorkerSection|WebhookSection|DunningSection|Card style=\{\{ borderStyle: 'dashed' \}\})/g);
    expect(cards).toHaveLength(PANEL_COUNT);
    expect(page).toContain('Array.from({ length: PANEL_COUNT }');
  });
});

describe('BR-04 — the stale-figures threshold is configuration', () => {
  it('Freshness takes it from the response, with no minute literal left in the component', () => {
    expect(page).toContain('staleAfterMinutes={data?.figuresStaleAfterMinutes');
    expect(parts).toContain('minutes >= staleAfterMinutes');
    expect(parts).not.toContain("minutes >= 15");
  });
});

describe('dunning outcomes all have words', () => {
  it('covers every outcome migration 0032 allows, including in_flight', () => {
    for (const outcome of ['charged', 'declined', 'not_made', 'skipped', 'in_flight']) {
      expect(OUTCOME_WORDS[outcome], outcome).toEqual(expect.any(String));
    }
  });
});
