import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statusChip } from '../lib/appointment-display';

/**
 * Jira GRW-307 — Search showed a booking with no status.
 *
 * A search for "Mohit Nair" listed "14 Sept · Deep Tissue Massage · Sana" under
 * Bookings and "0 visits" under Customers. Both were right — the booking was
 * still `confirmed`, and a visit counts only once it is marked completed — but
 * the row said nothing about what became of the booking, so it read as a service
 * he had had. The API always returned `status`; the row never drew it.
 */
const client = readFileSync(resolve(__dirname, 'SearchClient.tsx'), 'utf8');
const bookingsPage = readFileSync(resolve(__dirname, '../appointments/page.tsx'), 'utf8');
const bookingsList = readFileSync(resolve(__dirname, '../appointments/BookingsList.tsx'), 'utf8');
const searchCss = readFileSync(resolve(__dirname, '../styles/26-search.css'), 'utf8');

describe('a search result says what became of the booking', () => {
  it('draws the status chip on every booking row', () => {
    expect(client).toMatch(/statusChip\(b\)/);
  });

  it('uses the same four words as the Bookings screen', () => {
    expect(statusChip({ status: 'confirmed' }).text).toBe('Confirmed');
    expect(statusChip({ status: 'completed' }).text).toBe('Completed');
    expect(statusChip({ status: 'no_show' }).text).toBe("Didn't come");
    expect(statusChip({ status: 'cancelled' }).text).toBe('Cancelled');
  });
});

describe('the rows are pressable', () => {
  it('a client opens their card in place, and the call button stays its own control', () => {
    expect(client).toMatch(/<button type="button" className="res-main" onClick=\{\(\) => setOpenClientId\(c\.id\)\}>/);
    expect(client).toMatch(/<ClientProfileCard clientId=\{openClientId\}/);
    // A link inside a button is invalid and unreachable by keyboard: the call link is a sibling.
    expect(client).toMatch(/<\/button>\s*\{\/\* GRW-199[^]*?<a className="call"/);
  });

  it('a booking is a link to its day on Bookings with the sheet open', () => {
    expect(client).toMatch(/<a className="res-row res-link"[^>]*href=\{bookingHref\(b\.id, b\.startAt, timezone\)\}/);
    expect(client).toMatch(/`\/appointments\?date=\$\{day\}&open=\$\{id\}`/);
  });

  it("the day is the salon's, not the browser's", () => {
    expect(client).toMatch(/new Intl\.DateTimeFormat\('en-CA', \{ timeZone: timezone \}\)/);
  });

  it('Bookings shape-checks ?open= and opens the booking once, whole combo included', () => {
    expect(bookingsPage).toMatch(/openIdParam && \/\^\[0-9a-f-\]\{36\}\$\/i\.test\(openIdParam\)/);
    expect(bookingsPage).toMatch(/openAppointmentId=\{openAppointmentId\}/);
    expect(bookingsList).toMatch(/openedFromSearch\.current/);
    expect(bookingsList).toMatch(/g\.appointments\.some\(\(a\) => a\.id === openAppointmentId\)/);
  });
});

describe('the search bar row', () => {
  it('the back arrow and the box share one row, both 44px tall or more', () => {
    // `.srch-bar-row` had no rule, so the arrow sat on its own line above the box.
    expect(searchCss).toMatch(/\.srch-bar-row\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/);
    expect(searchCss).toMatch(/\.srch-bar-row \.icon-btn\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
    expect(searchCss).toMatch(/\.srch-bar-row \.search-bar\s*\{[^}]*min-height:\s*48px;/);
  });

  it('the box is 16px type, so a phone does not zoom in when it is focused', () => {
    expect(searchCss).toMatch(/\.srch-bar-row \.search-bar input\s*\{[^}]*font-size:\s*16px;/);
  });
});
