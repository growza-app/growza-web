import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';

/**
 * Jira GRW-289 · GRW-451 — Record payment must never let an unpaid visit look paid for, and must never take
 * the money twice.
 *
 * This file used to read `openCheckout` and `tillClosedUnpaid` in `NewVisitSheet`: "Take payment now" opened
 * a till over the done screen, and GRW-289/451 were about closing that till without saving — the whole sheet
 * shut, leaving a recorded unpaid visit with nothing on screen saying so.
 *
 * That till is gone (owner, 2026-10-10/11). Every payment in the app is the Record payment flow now, and
 * "Take payment now" is a link to it rather than an overlay — there is no sheet to close under anybody and
 * nothing for `openCheckout` to fail at. What survives of GRW-289's point is the half worth guarding, and it
 * has moved: the flow must refuse to take money against a visit that cannot receive it, and must say so.
 *
 * **What was lost, and is not pretended otherwise:** the immediate "saved, not paid" notice. A desk that
 * walks away from Record payment now learns from Bookings' "Not marked done yet" instead, which is a slower
 * telling than a line on the screen it just left.
 */
const here = __dirname;
const page = readFileSync(resolve(here, '../appointments/new/page.tsx'), 'utf8');
const flow = readFileSync(resolve(here, '../appointments/new/PayFlow.tsx'), 'utf8');
const wrapper = readFileSync(resolve(here, '../appointments/new/NewBookingClient.tsx'), 'utf8');
/** Comments still TALK about the till that was removed; only the code must be free of it. */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(here, 'NewVisitSheet.tsx'), 'utf8'));

describe('money is never taken twice against one visit', () => {
  it('only a booking that is still open can be settled', () => {
    // Matching on the id alone found a `completed` row perfectly well and opened the flow on it.
    expect(page).toMatch(/const one = day\.find\(\(a\) => a\.id === params\.visit && a\.status === 'confirmed'\);/);
    expect(page).toMatch(/const visitGone = Boolean\(paying && params\.visit && !visit\);/);
  });

  it('and the screen says so, in the flow that was asked for', () => {
    expect(flow).toMatch(/\{visitGone \? \(/);
    expect(flow).toMatch(/\{nv\.visitGone\}/);
    // `visitGone` must reach that flow even though there is no visit — otherwise a stale link falls back to
    // the one-page form at desk width, which has nowhere to say it and reads as an ordinary sale.
    expect(wrapper).toMatch(/const settlingBooking = purpose === 'payment' && \(Boolean\(visit\) \|\| visitGone\);/);
  });

  it('says it plainly: not open, maybe already settled, where to look', () => {
    expect(en.newVisit.visitGone).toMatch(/not open/);
    expect(en.newVisit.visitGone).toMatch(/already be settled/);
    expect(en.newVisit.visitGone).toMatch(/Bookings/);
  });

  it('a stale token says the same thing, as it always did', () => {
    expect(flow).toMatch(/\{tokenGone \? \(/);
    expect(en.newVisit.tokenGone).toMatch(/no longer waiting/);
  });

  it('the till this replaced is unreachable — there is no second way to take money', () => {
    expect(sheet).not.toMatch(/<CheckoutSheet/);
    expect(sheet).not.toMatch(/openCheckout|tillClosedUnpaid|setCheckoutRows/);
  });
});
