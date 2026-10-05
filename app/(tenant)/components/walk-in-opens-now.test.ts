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
 * Jira GRW-297 moved the centre action to the New Booking page (`/appointments/new`); Jira GRW-512
 * puts it back as a sheet from the bottom over the current screen, like the Day summary — the page
 * stays for the links that still go there. Either way it opens on `mode=now`.
 */
const chrome = readFileSync(resolve(__dirname, 'MobileChrome.tsx'), 'utf8');
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');

describe('the centre button opens the visit sheet on Walk-in now', () => {
  it('AC-01/AC-02 — for every role that can book, with no role deciding it', () => {
    expect(chrome).toMatch(/\? \(\) => setBookingOpen\(true\) : undefined/);
    expect(chrome).toMatch(/<NewVisitSheet\s+mode="now"\s+purpose="visit"/);
    expect(chrome).not.toMatch(/mode=later/);
    // The plus no longer navigates away from the screen it is on.
    expect(chrome).not.toMatch(/router\.push\('\/appointments\/new/);
  });

  it('AC-03 — a stylist still gets no centre action', () => {
    // Jira GRW-409 — asked of the shared rule, which a stylist fails (no POST /walk-ins or /bookings).
    expect(chrome).toMatch(/const mayBook = mayUse\(role, 'visit\.new'\);/);
    expect(chrome).toMatch(/const onCentre =\s*\n?\s*mayBook && /);
  });

  it('Jira GRW-512 — closing the sheet refreshes the screen behind it', () => {
    expect(chrome).toMatch(/onClose=\{\(\) => \{\s*setBookingOpen\(false\);\s*router\.refresh\(\);/);
  });

  it('AC-04 — For later is still one tap away inside the sheet', () => {
    // Jira GRW-518 — through `chooseMode`, so choosing Walk-in now also puts the Booking date back to today.
    expect(sheet).toMatch(/onClick=\{\(\) => chooseMode\('later'\)\}/);
    expect(sheet).toMatch(/mode: initialMode = 'now'/);
  });
});
