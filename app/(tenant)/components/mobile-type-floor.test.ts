import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-339 — no label on a phone is smaller than 12px.
 *
 * The rendered sizes were checked in a browser across every phone route at 320, 360, 393 and 428px, English and
 * Hindi. These pin the decisions that scan is not run to catch: the floor is phone-only, it beats a component's own
 * size, and the bottom bar's labels are 12px at their own rule.
 */
const css = (p: string) => readFileSync(resolve(__dirname, '../styles', p), 'utf8');

describe('the 12px phone floor', () => {
  const floor = css('87-mobile-type-floor.css');

  it('is a phone-only rule, and wins over a component size set in any media block', () => {
    expect(floor).toMatch(/@media \(max-width: 860px\)\s*\{[^@]*font-size:\s*12px !important;/);
    expect(floor).not.toMatch(/min-width/); // a laptop keeps its sizes
  });

  it('names the labels that were under 12px, and none is set below it', () => {
    for (const sel of ['.hm-tile-label', '.hm-hero-stats span', '.bk-kpi-label', '.att-tile-head', '.settings-group-title', '.notif-item-sub', '.rp-segment-range']) {
      expect(floor).toContain(sel);
    }
    expect(floor).not.toMatch(/font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/);
  });

  it('is loaded, after the sheets it overrides', () => {
    const globals = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');
    expect(globals.indexOf('87-mobile-type-floor.css')).toBeGreaterThan(globals.indexOf('86-money-card-phone.css'));
  });

  it('the bottom bar\'s tab and centre labels are 12px, and the narrow-phone bar gives them the room', () => {
    const chrome = css('74-mobile-chrome-2026.css');
    expect(chrome).toMatch(/\.bottom-nav a\s*\{[^}]*font-size:\s*12px;/);
    expect(css('83-role-home.css')).toMatch(/\.bn-centre-label\s*\{\s*font-size:\s*12px;/);
    expect(chrome).toMatch(/@media \(max-width: 400px\)\s*\{\s*\.bottom-nav\s*\{\s*margin-inline:\s*8px;/);
    expect(chrome).toMatch(/\.bottom-nav > a,\s*\.bottom-nav > \.bn-centre\s*\{\s*flex:\s*1 1 auto;/);
  });

  it('the unread count on the bell is 12px too', () => {
    expect(css('17-notification-bell.css')).toMatch(/\.bottom-nav \.bn-badge\s*\{[^}]*font-size:\s*12px;/);
  });
});
