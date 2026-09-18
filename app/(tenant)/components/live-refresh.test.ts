import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decideTick, FORCE_EVERY_TICKS, shouldPoll } from './LiveRefresh';

/**
 * Which screens keep a standing 15-second timer.
 *
 * `router.refresh()` re-renders the whole route on the server, so a poll
 * costs whatever that page costs — 27 queries for one refresh of the Reports
 * Clients tab, four times a minute, roughly 6,500 an hour for one owner who
 * left a tab open. That is a live-data price for data that is not live.
 *
 * The rule is what the screen is *for*, not how heavy it is: a booking taken
 * on WhatsApp has to appear on today's schedule without a reload, and has no
 * business redrawing a quarterly report. Every route still refetches when the
 * owner navigates to it or returns to the tab.
 */
describe('which screens poll', () => {
  it('polls the screens that show what is happening now', () => {
    expect(shouldPoll('/')).toBe(true);
    expect(shouldPoll('/appointments')).toBe(true);
    expect(shouldPoll('/availability')).toBe(true);
  });

  it('does not poll a report', () => {
    // The expensive one: three months of history, redrawn four times a minute.
    expect(shouldPoll('/reports')).toBe(false);
  });

  it('does not poll the slow-moving screens', () => {
    for (const route of ['/customers', '/services', '/offers', '/providers', '/settings', '/more']) {
      expect(shouldPoll(route)).toBe(false);
    }
  });

  it('matches the route exactly, so a child page does not inherit the timer', () => {
    // `/providers/<id>` is an edit form; nothing on it changes underneath the
    // owner, and a prefix match would have given it a timer for free.
    expect(shouldPoll('/providers/abc')).toBe(false);
    expect(shouldPoll('/settings/profile')).toBe(false);
    expect(shouldPoll('/appointments/anything')).toBe(false);
  });
});

/**
 * Jira GRW-310 — a tick asks "did anything change?" before it redraws.
 *
 * It used to redraw every 15 seconds regardless: a full server render, six or
 * seven API calls, four times a minute, on a screen nothing was happening to.
 */
describe('what a tick does', () => {
  const tick = (n: number, version: string | null, baseline: string | null) => decideTick({ tick: n, version, baseline });

  it('the first answer is only remembered — the page was just drawn', () => {
    expect(tick(1, 'a', null)).toEqual({ refresh: false, baseline: 'a' });
  });

  it('the same answer redraws nothing', () => {
    expect(tick(2, 'a', 'a')).toEqual({ refresh: false, baseline: 'a' });
    expect(tick(3, 'a', 'a')).toEqual({ refresh: false, baseline: 'a' });
  });

  it('a different answer redraws, and becomes the new baseline', () => {
    expect(tick(2, 'b', 'a')).toEqual({ refresh: true, baseline: 'b' });
  });

  it('every fourth tick redraws regardless, so clock-driven state still moves', () => {
    expect(FORCE_EVERY_TICKS).toBe(4);
    expect(tick(4, 'a', 'a')).toEqual({ refresh: true, baseline: 'a' });
    expect(tick(8, 'a', 'a').refresh).toBe(true);
    // ...and it re-baselines on what it saw.
    expect(tick(4, 'b', 'a')).toEqual({ refresh: true, baseline: 'b' });
  });

  it('a failed check (rate limited, offline) redraws nothing and keeps the baseline', () => {
    expect(tick(2, null, 'a')).toEqual({ refresh: false, baseline: 'a' });
    expect(tick(1, null, null)).toEqual({ refresh: false, baseline: null });
  });

  it('a failed check on a forced tick still redraws once, keeping the baseline', () => {
    expect(tick(4, null, 'a')).toEqual({ refresh: true, baseline: 'a' });
  });

  it('over a quiet minute that is one redraw in four ticks, not four', () => {
    let baseline: string | null = null;
    let redraws = 0;
    for (let n = 1; n <= FORCE_EVERY_TICKS; n += 1) {
      const next = decideTick({ tick: n, version: 'same', baseline });
      baseline = next.baseline;
      if (next.refresh) redraws += 1;
    }
    expect(redraws).toBe(1);
  });
});

describe('the other two background costs', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

  it('the bell does not poll while it is not displayed', () => {
    expect(read('NotificationBell.tsx')).toMatch(/getComputedStyle\(wrapRef\.current\)\.display === 'none'\) return;/);
  });

  it('/me is memoised per server render, and only on the server', () => {
    const api = read('../lib/api.ts');
    expect(api).toMatch(/const meThisRender = cache\(\(\) => get<Me>\('\/api\/v1\/me'\)\);/);
    expect(api).toMatch(/me: \(\) => \(typeof window === 'undefined' \? meThisRender\(\) : get<Me>\('\/api\/v1\/me'\)\)/);
  });

  it('a return to the tab redraws unconditionally, and is told apart from a tick', () => {
    expect(read('useVisibleInterval.ts')).toMatch(/callbackRef\.current\('visible'\)/);
    expect(read('LiveRefresh.tsx')).toMatch(/if \(reason === 'visible'\) \{[\s\S]*?router\.refresh\(\);/);
  });
});
