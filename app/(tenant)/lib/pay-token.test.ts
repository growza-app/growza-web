import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { billKeyOf, nextCustomerHref, payTokenHref } from './pay-token';

const here = dirname(fileURLToPath(import.meta.url));
const code = (rel: string) => readFileSync(resolve(here, rel), 'utf8');

// Owner, 2026-10-07 — every way into Record payment opens the one page, so it is one form at every width.
describe('paying a waiting token opens the Record payment page', () => {
  it('carries the token and its branch in the address', () => {
    expect(payTokenHref({ id: 'q1', locationId: 'b1' })).toBe('/appointments/new?purpose=payment&token=q1&location=b1');
    expect(payTokenHref({ id: 'q1' })).toBe('/appointments/new?purpose=payment&token=q1');
  });

  it('Close goes to a named screen, never browser history: Bookings when opened there, else Home', () => {
    expect(payTokenHref({ id: 'q1', locationId: 'b1' }, 'bookings')).toBe('/appointments/new?purpose=payment&token=q1&location=b1&from=bookings');
    expect(code('../appointments/BookingsList.tsx')).toMatch(/payTokenHref\(entry, 'bookings'\)/);
    const client = code('../appointments/new/NewBookingClient.tsx');
    expect(client).not.toMatch(/history|router\.back/);
    expect(client).toMatch(/router\.push\(backTo \?\? /);
  });

  it('a token that is no longer waiting is said, not silently dropped', () => {
    expect(code('../appointments/new/page.tsx')).toMatch(/const tokenGone = Boolean\(paying && params\.token && !token\)/);
    expect(code('../components/NewVisitSheet.tsx')).toMatch(/\{pageForm && tokenGone && <div role="alert" className="wi-error">\{nv\.tokenGone\}<\/div>\}/);
  });

  it('the page finds the token in that branch\'s queue and hands it to the form', () => {
    const page = code('../appointments/new/page.tsx');
    expect(page).toMatch(/api\.walkInQueue\(params\.location \?\? null\)\)\.find\(\(x\) => x\.id === params\.token\)/);
    expect(page).toMatch(/token=\{token\}/);
  });

  it('no screen opens the old Record payment overlay any more', () => {
    for (const f of ['../components/home/TokenBoard.tsx', '../components/home/OwnerHome.tsx', '../components/home/ReceptionHome.tsx', '../appointments/BookingsList.tsx']) {
      expect(code(f)).not.toMatch(/purpose="payment"/);
    }
  });
});

describe('paying a token has the same tray as the plain page', () => {
  const sheet = code('../components/NewVisitSheet.tsx');

  it('Mark done says what is missing instead of sitting greyed out', () => {
    expect(sheet).toMatch(/const ready = checkBeforeMarkDone\(stage\.client\);/);
    expect(sheet).toMatch(/const checkBeforeMarkDone = \(known\?: PickedClient\)/);
  });

  it('shows the total beside Mark done in both trays', () => {
    // `trayTotal` is itself payPage-only, so the page's tray asks about it alone; the sheet's still asks
    // whether a queue is on offer, because there it decides between one button and two.
    // Jira GRW-572 — the page's button is `goButton`, shared with the desk's right panel.
    expect(sheet).toMatch(/\{trayTotal \? <div className="wi-tray-row">\{trayTotal\}\{goButton\}<\/div> : goButton\}/);
    expect(sheet).toMatch(/if \(!queueOffered && trayTotal\) return <div className="wi-tray-row">\{trayTotal\}\{go\}<\/div>;/);
  });

  it('a package that would take the bill past the line cap is refused with a message, before Mark done', () => {
    expect(sheet).toMatch(/if \(forPayment && singles\.length \+ items\.length > BILL_MAX_LINES\) \{\s*setBillFull\(true\);\s*return;/);
    expect(sheet).toMatch(/nv\.billFull\(BILL_MAX_LINES\)/);
  });
});

// 2026-10-16 — paying refreshes the route and the settled token is gone from the page's props. What the till keys its
// bill on must not move when that happens, and must move when the desk goes to another bill.
describe('the till\'s bill key', () => {
  const key = (qs: string) => billKeyOf(new URLSearchParams(qs));
  it('is the token in the address, so the refresh after paying does not remount the Paid screen', () => {
    // The address is the same before and after the refresh; only the server's resolved token differs, and the key ignores that.
    expect(key('purpose=payment&token=t1&location=L')).toBe('t1');
  });
  it('is the booking in the address for a booking', () => {
    expect(key('purpose=payment&visit=v1&on=2026-10-16')).toBe('v1');
  });
  it('changes when the desk moves to another token or booking, so one bill\'s lines never ride into another', () => {
    expect(key('purpose=payment&token=t1')).not.toBe(key('purpose=payment&token=t2'));
    expect(key('purpose=payment&visit=v1&on=d')).not.toBe(key('purpose=payment&visit=v2&on=d'));
  });
  it('is the walk-in key once Next customer has dropped the bill from the address', () => {
    expect(key('purpose=payment')).toBe('walk-in');
    expect(key(nextCustomerHref().split('?')[1]!)).toBe('walk-in');
  });
});

describe('Next customer\'s address', () => {
  it('names no bill', () => {
    expect(nextCustomerHref()).toBe('/appointments/new?purpose=payment');
  });
  it('keeps Bookings as where Close goes, and the one-page form where it was asked for', () => {
    expect(nextCustomerHref({ from: 'bookings' })).toBe('/appointments/new?purpose=payment&from=bookings');
    expect(nextCustomerHref({ full: true })).toBe('/appointments/new?purpose=payment&full=1');
    expect(nextCustomerHref({ full: true, from: 'bookings' })).toBe('/appointments/new?purpose=payment&full=1&from=bookings');
  });
  it('never carries a token, a visit or a branch from the bill it is leaving', () => {
    expect(nextCustomerHref({ from: 'bookings', full: true })).not.toMatch(/token|visit|location|on=/);
  });
});
