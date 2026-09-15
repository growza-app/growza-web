import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-269 · GRW-274 — no fade hung across the middle of a phone screen.
 *
 * A sticky `.page-body::after` gradient meant to soften content under the bar
 * stuck to the scroll container's padding edge instead — ~68px up — and drew a
 * blurred band with a hard edge across the Bookings staff chips. The bar is in
 * flow, so there is nothing beneath it to soften. Any stylesheet bringing a
 * sticky pseudo-element back on `.page-body` fails here first.
 */
const stylesDir = resolve(__dirname, '../styles');

describe('the phone screen has no blurred band above the bottom bar', () => {
  it('no stylesheet puts a pseudo-element on .page-body', () => {
    for (const file of readdirSync(stylesDir).filter((f) => f.endsWith('.css'))) {
      const css = readFileSync(resolve(stylesDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, file).not.toMatch(/\.page-body::(after|before)/);
    }
  });
});
