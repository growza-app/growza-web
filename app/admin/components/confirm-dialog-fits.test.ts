import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every admin confirm dialog fits the window, and its buttons stay reachable.
 *
 * Add a branch is this component with six fields, two footnotes and a billing line inside it. At 1280x720 that
 * ran off the bottom of the screen: the backdrop is `position: fixed` and does not scroll, and the panel had no
 * height of its own, so Cancel and Add branch simply were not on screen. The two-branch device journey spent its
 * whole timeout clicking a button Playwright reported as "outside of the viewport".
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, 'ConfirmDialog.tsx'), 'utf-8');

describe('the admin confirm dialog fits the window', () => {
  it('is capped to the viewport and lays itself out as a column', () => {
    expect(src).toContain("maxHeight: 'calc(100dvh - 48px)'");
    expect(src).toContain("flexDirection: 'column'");
  });

  it('scrolls its middle, not the page behind it', () => {
    expect(src).toMatch(/overflowY: 'auto', minHeight: 0/);
  });

  it('keeps the buttons out of the scroll and stops them shrinking', () => {
    const actions = src.slice(src.indexOf('gap: 10, marginTop: 22'));
    expect(actions).toContain("flex: 'none'");
    // Cancel and the confirm button sit below the scrolling region, not inside it.
    expect(src.indexOf("overflowY: 'auto'")).toBeLessThan(src.indexOf('gap: 10, marginTop: 22'));
  });
});
