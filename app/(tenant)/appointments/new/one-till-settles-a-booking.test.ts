import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-10 — one screen takes money, whoever is paying.
 *
 * "The record payment screen is almost same, the only thing is the client will be pre-filled and the service
 * which we have been availed will be pre-selected, and any changes needs to be done at the time of payment
 * then that can also be done in the record screen, so the complete flow till the done screen will be the same."
 *
 * So a booking settles through `PayFlow` — `?purpose=payment&visit=<id>&on=<date>` — instead of a till of its
 * own. The screen is the same, the done screen is the same, and the one real difference is underneath:
 *
 *   a walk-in's payment CREATES the visit   → `recordCounterSale`
 *   a booking's payment COMPLETES it        → `checkout`
 *
 * Sending a sale for a booking takes the money correctly and leaves the booking `confirmed` for ever beside a
 * duplicate visit for the same work. That is what every assertion below is really guarding.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const here = __dirname;
const flow = strip(readFileSync(resolve(here, 'PayFlow.tsx'), 'utf8'));
const page = strip(readFileSync(resolve(here, 'page.tsx'), 'utf8'));
const client = strip(readFileSync(resolve(here, 'NewBookingClient.tsx'), 'utf8'));
const sheet = strip(readFileSync(resolve(here, '../../components/NewVisitSheet.tsx'), 'utf8'));

describe('one till settles a booking too', () => {
  it('reaches the pay flow by address, carrying the booking and its day', () => {
    // No read for one appointment by id — the day's list is, and the visit's other legs come back with it.
    expect(page).toMatch(/if \(paying && params\.visit && params\.on\) \{/);
    expect(page).toMatch(/const day = await api\.appointments\(params\.on, params\.on\);/);
    expect(page).toMatch(/const one = day\.find\(\(a\) => a\.id === params\.visit\);/);
    expect(client).toMatch(/<PayFlow token=\{token\}[^>]*visit=\{visit\}/);
  });

  it('settles the combo as one payment, and says when the booking is not there', () => {
    expect(page).toMatch(/a\.bookingGroupId === one\.bookingGroupId && a\.id !== one\.id && a\.status === 'confirmed'/);
    // Named a booking that cannot be settled (paid elsewhere, moved, cancelled) — do not take the money twice.
    expect(page).toMatch(/const visitGone = Boolean\(paying && params\.visit && !visit\);/);
  });

  it('fills the screen in from the booking, at the price it was booked at', () => {
    expect(flow).toMatch(/const visitFilled = useRef\(false\);/);
    // The booking carries its own name and price: a catalogue rise does not change what the client was quoted.
    expect(flow).toMatch(/priceMinor: Number\(a\.priceMinor \?\? 0\),/);
    expect(flow).toMatch(/setClient\(\{ kind: 'named', name: visit\.appointment\.customerName \?\? '' \}\);/);
  });

  it('lets one effect own the stylist, so the remembered one cannot replace the booked one', () => {
    /*
     * The prefill guards itself with a ref. React mounts, unmounts and mounts again in development; the ref
     * survives that, so the prefill's second pass returns early while the remembered-stylist effect runs
     * again — and Fatima, who is doing the work, was silently replaced by whoever the phone saw last.
     */
    expect(flow).toMatch(/const booked = visit\?\.appointment\.providerId \?\? null;/);
    expect(flow).toMatch(/setStylistId\(booked \?\? \(last === 'nobody' \? null : \(last \?\? providerId\)\)\);/);
    expect(flow).toMatch(/\}, \[providerId, visit\]\);/);
    // And the prefill no longer touches it, or there would be two owners again.
    const fill = flow.slice(flow.indexOf('if (!visit || visitFilled.current) return;'));
    expect(fill.slice(0, fill.indexOf('}, [visit]);'))).not.toMatch(/setStylistId/);
  });

  it('completes the booking instead of selling it again', () => {
    expect(flow).toMatch(/const settled = visit\s*\n?\s*\? await \(async \(\) => \{/);
    expect(flow).toMatch(/api\.checkout\(visit\.appointment\.id, \{/);
    // A booked leg still on the bill rides as a group member; anything new is an extra; anything the client
    // did not have is cancelled, which releases its chair.
    expect(flow).toMatch(/groupMembers\.push\(\{ appointmentId: id, paidAmountMinor: amounts\[i\]!/);
    expect(flow).toMatch(/extraServices\.push\(\{ serviceId: l\.serviceId, paidAmountMinor: amounts\[i\]!/);
    expect(flow).toMatch(/const cancelMemberIds = \[\.\.\.left\.values\(\)\]\.flat\(\)\.filter\(\(id\) => id !== visit\.appointment\.id\);/);
    // The walk-in's own write is untouched beside it.
    expect(flow).toMatch(/api\.recordCounterSale\(/);
  });

  it('sends Mark as done to that flow, and takes the till out of the booking sheet', () => {
    const book = strip(readFileSync(resolve(here, '../../components/BookingSheet.tsx'), 'utf8'));
    expect(book).toMatch(/const markDone = \(\) => router\.push\(payVisitHref\(/);
    // Done goes back to Bookings, not Home: that is where the person was.
    expect(book).toMatch(/timezone, 'bookings'\)\)/);
    // The till it replaces is gone from here, and so is everything it was loaded for.
    expect(book).not.toMatch(/CheckoutSheet/);
    expect(book).not.toMatch(/setCheckingOut|openCheckout|setOffers|loadServicesFailed/);
  });

  it('sends Take payment now to that flow, not to a till of its own', () => {
    expect(sheet).toMatch(/onClick=\{\(\) => router\.push\(payVisitHref\(stage\.result, timezone\)\)\}/);
  });

  it('sends the token board there too, and the last till on Home is gone', () => {
    const board = strip(readFileSync(resolve(here, '../../components/home/TokenBoard.tsx'), 'utf8'));
    expect(board).toMatch(/payVisitHref\(\{ appointmentId: x\.legIds\[0\]!, startAt: x\.visitStartAt! \}, timezone\)/);
    // `VisitTill` existed only to find the visit's rows before opening a till; the page does that now.
    expect(board).not.toMatch(/VisitTill|setTill/);
    expect(existsSync(resolve(here, '../../components/home/VisitTill.tsx'))).toBe(false);
    // Its focus-restore wish no longer has a till to wait on.
    expect(board).toMatch(/if \(!want \|\| giving\) return;/);
  });

  it("sends the receipt to the booking's own number", () => {
    // A booking's client is held as `named` (there is no `customerId` on an Appointment), so asking `client`
    // for a phone gives nothing — and the done screen's WhatsApp box came up empty for Paul, who has one.
    expect(flow).toMatch(/phone: token\?\.customerPhone \?\? visit\?\.appointment\.customerPhone \?\? \(client\.kind === 'existing' \? client\.phone : null\)/);
  });

  it('builds that address in one place, so three doors cannot drift', () => {
    const lib = strip(readFileSync(resolve(here, '../../lib/pay-token.ts'), 'utf8'));
    expect(lib).toMatch(/export function payVisitHref\(/);
    // The SALON's day: an 11:40pm visit is still today in Bengaluru when the laptop has rolled over.
    expect(lib).toMatch(/new Intl\.DateTimeFormat\('en-CA', \{ timeZone: timezone \}\)\.format\(new Date\(visit\.startAt\)\)/);
  });
});
