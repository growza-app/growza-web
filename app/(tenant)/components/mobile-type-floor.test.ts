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
    expect(floor).toMatch(/@media \(max-width: 860px\)\s*\{[^@]*font-size:\s*0\.75rem !important;/);
    expect(floor).not.toMatch(/min-width/); // a laptop keeps its sizes
  });

  it('names the labels that were under 12px, and none is set below it', () => {
    for (const sel of ['.hm-tile-label', '.hm-hero-stats span', '.bk-kpi-label', '.att-tile-head', '.settings-group-title', '.notif-item-sub', '.rp-segment-range']) {
      expect(floor).toContain(sel);
    }
    for (const [, v] of floor.matchAll(/font-size:\s*([0-9.]+)rem/g)) expect(Number(v)).toBeGreaterThanOrEqual(0.75);
    expect(floor).not.toMatch(/font-size:\s*[0-9.]+px/);
  });

  it('is loaded, after the sheets it overrides', () => {
    const globals = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');
    expect(globals.indexOf('87-mobile-type-floor.css')).toBeGreaterThan(globals.indexOf('86-money-card-phone.css'));
  });

  it('the bottom bar\'s tab and centre labels are 12px, and the narrow-phone bar gives them the room', () => {
    const chrome = css('74-mobile-chrome-2026.css');
    expect(chrome).toMatch(/\.bottom-nav a\s*\{[^}]*font-size:\s*0\.75rem;/);
    // Jira GRW-495 — the pill's label is a button's, so 14px; it left the bar's twelve-pixel row.
    expect(css('83-role-home.css')).toMatch(/\.bn-centre-label\s*\{\s*font-size:\s*0\.875rem;/);
    expect(chrome).toMatch(/@media \(max-width: 400px\)\s*\{\s*\.bottom-nav\s*\{\s*margin-inline:\s*8px;/);
    // Jira GRW-481 — `1 1 0`, not `1 1 auto`: the cells take an equal share of the bar
    // rather than sizing to their own longest word. Once the labels grew with the
    // reader's text size, content-sized cells pushed the last tab off the screen.
    expect(chrome).toMatch(/\.bottom-nav > a\s*\{\s*flex:\s*1 1 0;/);
  });

  it('the unread count on the bell is 12px too', () => {
    expect(css('17-notification-bell.css')).toMatch(/\.bottom-nav \.bn-badge\s*\{[^}]*font-size:\s*0\.75rem;/);
  });
});

/**
 * Jira GRW-481 — the bar survives the reader's text size.
 *
 * Once every label was in `rem`, the five tabs grew with Larger Text, and the bar
 * was built to size itself to its own longest word: at the largest standard size
 * the labels ran into one another and "Notifications" left the screen entirely.
 * Measured in a browser at 390px with the root at 16, 20 and 23px — nothing off
 * the right edge at any of them. These pin the three rules that make that true.
 */
describe('the bottom bar at a large text size', () => {
  const chrome = css('74-mobile-chrome-2026.css');
  const home = css('83-role-home.css');

  it('lets the bar itself shrink to the phone', () => {
    expect(chrome).toMatch(/\.bottom-nav\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/);
  });

  it('gives every cell an equal share rather than its own longest word', () => {
    expect(chrome).toMatch(/\.bottom-nav a\s*\{[^}]*flex:\s*1 1 0;/);
    // Jira GRW-495 — the pill floats, so it is not a cell: it is capped to the screen instead.
    expect(home).toMatch(/\.bn-centre\s*\{[^}]*max-width:\s*calc\(100vw - 2 \* var\(--sp-4\)\);/);
  });

  it('gives each label something CSS can shorten', () => {
    // A bare text node cannot be ellipsised, so the label is its own element.
    expect(readFileSync(resolve(__dirname, 'BottomNav.tsx'), 'utf8')).toMatch(/className="bn-label">\{item\.label\}/);
    expect(chrome).toMatch(/\.bottom-nav \.bn-label\s*\{[^}]*text-overflow:\s*ellipsis;/);
    expect(home).toMatch(/\.bn-centre-label\s*\{[^}]*text-overflow:\s*ellipsis;/);
  });
});
