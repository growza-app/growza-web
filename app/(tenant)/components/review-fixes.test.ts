import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-305 · GRW-306 — fixes from the review of the tenant UX pass.
 *
 * Source-text checks, like the rest of this folder: the pieces below are ARIA
 * attributes and CSS sizes, and a browser test would only read the same strings.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the walk-in sheet says only what its controls do', () => {
  const sheet = code('NewVisitSheet.tsx');

  it('no button is turned into a list item, and no list has non-item children', () => {
    expect(sheet).not.toMatch(/role="listitem"/);
    expect(sheet).not.toMatch(/role="list"/);
  });

  it('chairs, days and times are labelled groups of toggle buttons, not a radiogroup with no arrow keys', () => {
    for (const label of ['nv.withWhom(providerNoun.toLowerCase())', 'nv.whichDay', 'nv.whichTime']) {
      expect(sheet).toContain(`role="group" aria-label={${label}}`);
    }
    expect(sheet).toMatch(/aria-pressed=\{noStylist\}/);
    expect(sheet).toMatch(/aria-pressed=\{day === d\.iso\}/);
    expect(sheet).toMatch(/aria-pressed=\{slotUtc === slot\.utc\}/);
  });

  it('both tabs point at a panel that exists on the client screen', () => {
    // Jira GRW-514 — one client screen now (find or add), so one panel; there were two stages before.
    expect(sheet.match(/id="wi-client-panel"/g)).toHaveLength(1);
  });
});

describe('the account menu keeps focus inside as it changes', () => {
  const menu = code('AccountMenu.tsx');

  it('focus follows the form, and comes back to the dialog when it closes', () => {
    expect(menu).toMatch(/if \(!open \|\| busy\) return;/);
    expect(menu).toMatch(/if \(changing && !done\) document\.getElementById\('acct-current'\)\?\.focus\(\);/);
    expect(menu).toMatch(/\[open, changing, done, busy\]/);
  });
});

describe('a phone does not zoom when these fields are focused (pinch-zoom is allowed now)', () => {
  const css = (p: string) => read(`../styles/${p}`);

  it('the Bookings search and filter fields and the checkout amount are 16px', () => {
    expect(css('32-customers.css')).toMatch(/\.bk-search-row input \{[^}]*font-size: 16px;/);
    expect(css('32-customers.css')).toMatch(/\.bk-field input \{[^}]*font-size: 16px;/);
    expect(css('32-customers.css')).toMatch(/\.bk-field select \{\s*font-size: 16px;/);
    expect(css('14-checkout-sheet.css')).toMatch(/\.checkout-amount-field input \{[^}]*font-size: 16px;/);
  });
});

/**
 * Jira GRW-491 — the owner asked for the ▲▼ on the amount field to go.
 *
 * `type='number'` is kept: it is what gets the numeric keypad on a phone and what refuses letters. Only the
 * painted buttons go, and the keyboard's own ↑/↓ still step the value. Checked on the SHARED rule, not on the
 * checkout sheet, because the next number field should not have to remember this.
 */
describe('a number field has no stepper arrows', () => {
  const css = read('../styles/11-availability.css');

  it('both halves — WebKit paints two pseudo-elements, Firefox needs the appearance', () => {
    expect(css).toMatch(/input\[type='number'\]::-webkit-outer-spin-button,\s*input\[type='number'\]::-webkit-inner-spin-button \{\s*-webkit-appearance: none;\s*margin: 0;/);
    expect(css).toMatch(/input\[type='number'\] \{\s*-moz-appearance: textfield;\s*appearance: textfield;/);
  });

  it('the fields are still number fields — the keypad and the digits-only rule are the point of them', () => {
    expect(read('CheckoutSheet.tsx')).toMatch(/type="number"/);
    expect(css).toMatch(/input\[type='number'\],/);
  });
});

describe('a phone keeps the account banner off the screen edges', () => {
  it('only when there is a banner', () => {
    expect(read('../styles/32-customers.css')).toMatch(/\.content-banners:not\(:empty\) \{\s*padding: 10px max\(16px, env\(safe-area-inset-right\)\) 0 max\(16px, env\(safe-area-inset-left\)\);/);
  });
});
