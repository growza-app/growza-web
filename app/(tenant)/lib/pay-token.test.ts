import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { payTokenHref } from './pay-token';

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
    expect(sheet.match(/if \(!queueOffered && trayTotal\) return <div className="wi-tray-row">\{trayTotal\}\{go\}<\/div>;/g)).toHaveLength(2);
  });

  it('a package that would take the bill past 12 lines is refused with a message, before Mark done', () => {
    expect(sheet).toMatch(/if \(forPayment && singles\.length \+ items\.length > BILL_MAX_LINES\) \{\s*setBillFull\(true\);\s*return;/);
    expect(sheet).toMatch(/nv\.billFull\(BILL_MAX_LINES\)/);
  });
});
