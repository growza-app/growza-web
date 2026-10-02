import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-457 — the three buttons of the walk-in step sit on the same edges.
 *
 * `.wi-actions` is `justify-content: flex-end` with no wrap, and GRW-451's "a line of its own" rule for
 * "Add to waiting queue" lived inside `@media (max-width: 860px)`. That gave two different wrong layouts:
 * on a wide screen all three went on one line, so the ghost alternative stood to the RIGHT of "Start now",
 * in the corner this app keeps for the primary action; and on a phone the pair sat flush right above a
 * full-width button, three widths and two alignments with nothing lining up.
 *
 * Measured on the running app after the fix, at 1440 / 861 / 860 / 430 / 320: Back's left edge and the queue
 * button's left edge are the same number, and so are the primary's right edge and the queue button's right
 * edge. There is no browser harness on CI, so what is asserted here is the rule that produced those numbers.
 */
const css = readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8');

describe('the walk-in footer frames its three buttons', () => {
  it('wraps, and pushes the pair to the two edges', () => {
    const rule = css.slice(css.indexOf('.wi-actions:has(.wi-queue-btn)'));
    expect(rule.slice(0, 120)).toMatch(/flex-wrap:\s*wrap/);
    expect(rule.slice(0, 120)).toMatch(/justify-content:\s*space-between/);
  });

  it('asks for the queue button before changing anything, so the other footers are untouched', () => {
    // Record payment and the Move sheet draw Back + one primary and nothing else: they must stay grouped at
    // the right, which is `.modal-actions`' own flex-end. A bare `.wi-actions { justify-content: ... }` would
    // spread those two to opposite ends of the sheet.
    expect(css).not.toMatch(/^\.wi-actions\s*\{[^}]*justify-content/m);
    expect(css).toContain('.wi-actions:has(.wi-queue-btn)');
  });

  it('breaks the line at every width, not only below 861px', () => {
    // Both rules at column 0: nothing in this file nests them in a media query any more, which is why 860
    // and 861 now draw the same footer.
    expect(css).toMatch(/^\.wi-actions \.wi-queue-btn\s*\{/m);
    expect(css).toMatch(/^\.wi-actions:has\(\.wi-queue-btn\)\s*\{/m);
    expect(css.slice(css.indexOf('.wi-actions:has'))).not.toContain('@media (max-width: 860px)');
  });
});
