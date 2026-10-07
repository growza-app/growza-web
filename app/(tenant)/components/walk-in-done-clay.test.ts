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
  it('every Done is the finish button, in all three end states', () => {
    // After a payment its bill's Send on WhatsApp is the filled action, so that Done is the quiet variant (2026-10-07).
    expect(sheet.match(/className="sheet-item wi-finish(?: wi-finish-quiet)?" onClick=\{onClose\}/g)).toHaveLength(3);
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
