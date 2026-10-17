import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QA, 2026-10-17 — every sale ended on "Something on this screen went wrong".
 *
 * `PayFlow` returns early for the done, QR and how screens. Two `useMemo` calls sat below those returns, so the
 * render that reached the done screen ran fewer hooks than the one before it and React threw. A hook belongs above
 * the first `if (step === …) return`; this pin fails the moment one slips below it again.
 */
describe('PayFlow keeps its hooks above the early returns', () => {
  const src = readFileSync(resolve(__dirname, 'PayFlow.tsx'), 'utf8');
  const firstEarlyReturn = src.indexOf("  if (step === 'done' && sale) {");

  it('finds the first early return', () => {
    expect(firstEarlyReturn).toBeGreaterThan(0);
  });

  it('calls no hook after it', () => {
    const below = src.slice(firstEarlyReturn);
    expect(below).not.toMatch(/\buse(Memo|State|Effect|Ref|Callback|Dialog|Router|Translations|Locale)\(/);
  });
});
