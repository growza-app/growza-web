import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../styles/97-services-rebuilt.css'), 'utf8');

/**
 * A service row's face is its own stacking layer (z-index 1). The ⋮ menu is fixed inside it, so the next row's
 * face painted over the open menu: it was open, white, and unreadable behind the rows below.
 */
describe('the ⋮ menu on a service row', () => {
  it('lifts its own row above the rows after it', () => {
    const face = /\.svc-swipe-face \{[^}]*z-index:\s*(\d+)/.exec(css);
    const lifted = /\.svc-swipe-face:has\(\.dropdown-panel\) \{\s*z-index:\s*(\d+)/.exec(css);
    expect(face).not.toBeNull();
    expect(lifted).not.toBeNull();
    expect(Number(lifted![1])).toBeGreaterThan(Number(face![1]));
  });
});
