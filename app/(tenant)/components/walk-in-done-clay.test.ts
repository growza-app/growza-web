import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The walk-in confirmation in the clay style: a centred check dome, and Done as a real button. */
const here = (p: string) => readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), p), 'utf-8');
const sheet = here('./NewVisitSheet.tsx');
const css = here('../styles/72-walk-in-sheet.css');
const clay = here('../styles/101-clay-app.css');

describe('the walk-in confirmation', () => {
  it('every Done is the finish button, in both visit end states', () => {
    // After a payment the form ends on the shared payment screen (owner, 2026-10-10), whose Done is its own.
    expect(sheet).not.toMatch(/className="sheet-item wi-finish wi-finish-quiet" onClick=\{onClose\}/);
    // Queued and booked took the same shape: quiet only while there is a message above them to send.
    expect(sheet.match(/className=\{`sheet-item wi-finish \$\{stage\.confirm \? 'wi-finish-quiet' : ''\}`\} onClick=\{onClose\}/g)).toHaveLength(2);
  });

  /** Owner, 2026-10-07 — the confirmation is handed over the same way the bill is, by the same component. */
  it('offers the booking or the token on WhatsApp, and nothing after a visit that just started', () => {
    expect(sheet.match(/<ReceiptShare bill=\{stage\.confirm\} phone=\{stage\.client\.phone \|\| null\} kind="confirm" \/>/g)).toHaveLength(2);
    // Built as the visit lands, like the bill: the page refreshes after a save and the state behind it moves.
    expect(sheet).toMatch(/if \(!opts\.startAt && opts\.tokenNo === null\) return null;/);
  });

  it('is centred, with the check in a round badge', () => {
    expect(css).toMatch(/\.wi-done \{[^}]*flex-direction: column;[^}]*text-align: center;/);
    expect(css).toMatch(/\.wi-done svg \{[^}]*border-radius: 50%;[^}]*background: var\(--accent-soft\);/);
  });

  it('Done is green alone, and quiet under Take payment', () => {
    expect(css).toMatch(/\.wi-body \.sheet-item\.wi-finish \{[^}]*min-height: 48px;[^}]*background: var\(--accent-deep\);/);
    expect(css).toMatch(/\.wi-body \.wi-take-payment ~ \.sheet-item\.wi-finish,/);
  });

  it('is raised in clay: the card, the badge, Close and the buttons', () => {
    expect(clay).toMatch(/\.walk-in-page \{\s*box-shadow: var\(--clay-raise\);/);
    expect(clay).toMatch(/\.wi-done svg \{[^}]*box-shadow: var\(--clay-raise\);/);
    expect(clay).toMatch(/\.wi-close \{\s*box-shadow: var\(--clay-raise-soft\);/);
    expect(clay).toMatch(/\.wi-body \.sheet-item\.wi-finish \{[^}]*box-shadow: var\(--clay-green\);/);
  });
});
