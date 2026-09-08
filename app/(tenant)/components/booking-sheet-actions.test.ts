import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-63 · GRW-195 — a stylist is offered no button that would 403.
 *
 * The API is the boundary and it is closed: `PATCH /appointments/:id/status`
 * and `POST /appointments/:id/checkout` both refuse a staff session. This is
 * about the other half — a control that answers "forbidden" reads as the
 * product being broken rather than as a rule, so the sheet must not draw the
 * three outcome actions for somebody who cannot use them.
 *
 * All three, not two: "Mark as done" opens the checkout flow, and checkout
 * sets `status = 'completed'`, so it is an outcome action wearing a till's
 * clothing.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const source = readFileSync(path.join(repoRoot, 'web/app/(tenant)/components/BookingSheet.tsx'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('BookingSheet outcome actions', () => {
  it('gates the whole action block on canSettle, not just part of it', () => {
    /**
     * The mistake this catches is a half-fix: hiding no-show and cancel while
     * leaving "Mark as done" — the one that actually completes the booking —
     * on screen.
     */
    expect(source).toMatch(/\{!settled && canSettle && \(/);
  });

  it('draws no outcome action outside that block', () => {
    const block = source.slice(source.indexOf('{!settled && canSettle && ('));
    // The BUTTONS, not the handlers — `openCheckout` is also declared above,
    // and a declaration outside the block is not a control outside it.
    for (const control of ['onClick={openCheckout}', "onClick={() => setStatus('no_show')}", "onClick={() => setStatus('cancelled')}"]) {
      expect(source.split(control).length - 1, `${control} is missing`).toBe(1);
      expect(block.split(control).length - 1, `${control} is rendered outside the gated block`).toBe(1);
    }
  });

  it('defaults to true, so the owner-only Home timeline is unaffected', () => {
    expect(source).toMatch(/canSettle = true/);
  });
});

describe('the Bookings list passes the viewer through', () => {
  const list = readFileSync(path.join(repoRoot, 'web/app/(tenant)/appointments/BookingsList.tsx'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('tells the sheet a stylist cannot settle', () => {
    // A prop with a default is only as good as the one call site that has to
    // pass it — this is the one screen a stylist can reach.
    expect(list).toMatch(/canSettle=\{!viewerIsStaff\}/);
  });
});
