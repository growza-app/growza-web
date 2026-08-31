import { describe, expect, it } from 'vitest';
import { shouldPoll } from './LiveRefresh';

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
