import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-268 · GRW-273 — the phone's centre button opens on "Walk-in now".
 *
 * It opened a receptionist on now and everybody else — the owner included — on
 * "For later". The person tapping it on a phone mostly has a customer standing
 * there. Read from source: MobileChrome is a client component with no DOM in
 * this test environment, and the line that decides is one expression.
 *
 * Jira GRW-297 — the centre action no longer mounts `NewVisitSheet` as an
 * overlay here; it navigates to the New Booking page (`/appointments/new`)
 * instead, which is `NewVisitSheet` again underneath (`presentation="page"`),
 * defaulted to the same `mode=now`.
 */
const chrome = readFileSync(resolve(__dirname, 'MobileChrome.tsx'), 'utf8');
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');

describe('the centre button opens the visit sheet on Walk-in now', () => {
  it('AC-01/AC-02 — for every role that can book, with no role deciding it', () => {
    expect(chrome).toMatch(/\(\) => router\.push\('\/appointments\/new\?mode=now'\)/);
    expect(chrome).not.toMatch(/mode=later/);
  });

  it('AC-03 — a stylist still gets no centre action', () => {
    // Jira GRW-409 — asked of the shared rule, which a stylist fails (no POST /walk-ins or /bookings).
    expect(chrome).toMatch(/const mayBook = mayUse\(role, 'visit\.new'\);/);
    expect(chrome).toMatch(/const onCentre =\s*\n?\s*mayBook && /);
  });

  it('AC-04 — For later is still one tap away inside the sheet', () => {
    expect(sheet).toMatch(/onClick=\{\(\) => setMode\('later'\)\}/);
    expect(sheet).toMatch(/mode: initialMode = 'now'/);
  });
});
