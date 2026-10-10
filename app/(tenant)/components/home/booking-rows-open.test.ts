import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-11, pointing at a row on Home: "is this clickable?"
 *
 * It was not. "Bookings today" drew plain `<li>`s — no link, no handler — while naming a client, a service,
 * a stylist and a status, and looking exactly like the rows that DO open everywhere else in the app. A desk
 * that taps "Divya Rao" and gets nothing has learned the card is dead and stops trying; "View all" was the
 * only way in.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const parts = strip(readFileSync(resolve(__dirname, 'parts.tsx'), 'utf8'));
const lib = strip(readFileSync(resolve(__dirname, '../../lib/pay-token.ts'), 'utf8'));
const css = strip(readFileSync(resolve(__dirname, '../../styles/83-role-home.css'), 'utf8'));

describe('a booking row on Home opens that booking', () => {
  it('is a link over the whole row, not a handler on part of it', () => {
    expect(parts).toMatch(/<Link className="hm-row-link" href=\{openBookingHref\(g\.appointments\[0\]!\.id, dayOf\(g\.startAt\)\)\}>/);
    // The pill is inside the link, so it is not a second target sitting beside it.
    expect(parts).toMatch(/<StatusPill t=\{t\} group=\{g\} now=\{now\} \/>\s*\n\s*<\/Link>/);
  });

  it("carries the row's OWN day, because this list shows tomorrow once today is done", () => {
    expect(parts).toMatch(/const dayOf = \(iso: string\) => new Intl\.DateTimeFormat\('en-CA', \{ timeZone: timezone \}\)\.format\(new Date\(iso\)\);/);
  });

  it('shares the address with the done screen, under a name that fits both', () => {
    // Was `fixVisitHref`, which only described the done screen's use of it.
    expect(lib).toMatch(/export function openBookingHref\(appointmentId: string, day\?: string \| null\)/);
    expect(lib).not.toMatch(/fixVisitHref/);
    expect(lib).toMatch(/q\.set\('date', day\);\s*\n\s*q\.set\('to', day\);/);
  });

  it('lets the link carry the layout, and shows focus on the whole row', () => {
    const rule = css.slice(css.indexOf('.hm-row-link {'));
    const block = rule.slice(0, rule.indexOf('}'));
    // `gap: inherit`, not a second copy of the row's geometry — that is how two lists drift apart.
    expect(block).toMatch(/gap: inherit;/);
    expect(block).toMatch(/text-decoration: none;/);
    expect(css).toMatch(/\.hm-row-link:focus-visible \{/);
  });
});
