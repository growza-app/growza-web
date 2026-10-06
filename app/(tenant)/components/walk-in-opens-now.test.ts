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
 * Jira GRW-297 moved the centre action to the New Booking page (`/appointments/new`); Jira GRW-512 made it
 * a sheet over the current screen; Jira GRW-523 puts it back as the page ("Add new" is a next screen, not
 * a popup). Always on `mode=now`.
 */
const chrome = readFileSync(resolve(__dirname, 'MobileChrome.tsx'), 'utf8');
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');

describe('the centre button opens the visit sheet on Walk-in now', () => {
  it('AC-01/AC-02 — for every role that can book, with no role deciding it', () => {
    // Jira GRW-523 — a next screen again (the page), no longer a sheet over the current one (GRW-512).
    expect(chrome).toMatch(/\? \(\) => router\.push\('\/appointments\/new\?mode=now'\) : undefined/);
    expect(chrome).not.toMatch(/mode=later/);
    expect(chrome).not.toMatch(/<NewVisitSheet|setBookingOpen/);
  });

  it('AC-03 — a stylist still gets no centre action', () => {
    // Jira GRW-409 — asked of the shared rule, which a stylist fails (no POST /walk-ins or /bookings).
    expect(chrome).toMatch(/const mayBook = mayUse\(role, 'visit\.new', writable\);/);
    expect(chrome).toMatch(/const onCentre =\s*\n?\s*mayBook && /);
  });

  it('AC-04 — a later booking is still one step away: choose a Booking date (Jira GRW-519, no tabs)', () => {
    // Left alone the sheet is a walk-in now; choosing a date — even today's — makes it a booking for that day.
    expect(sheet).toMatch(/mode: initialMode = 'now'/);
    expect(sheet).toMatch(/const \[dateChosen, setDateChosen\] = useState\(!forPayment && initialMode === 'later'\);/);
    expect(sheet).toMatch(/const mode: VisitMode = dateChosen \|\| timeWanted !== '' \? 'later' : 'now';/);
  });
});
