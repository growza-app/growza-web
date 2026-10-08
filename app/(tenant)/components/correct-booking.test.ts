import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../lib/dashboard-root';

/**
 * The owner fixes a finished booking's amount or service.
 *
 * Source-string checks, like the neighbouring sheet tests: the rules here are about what is drawn, for whom, and
 * what each control can reach, so they are asked of the source.
 */
const sheet = readFileSync(fromDashboard('app/(tenant)/components/CorrectBookingSheet.tsx'), 'utf-8');
const summary = readFileSync(fromDashboard('app/(tenant)/components/BookingSummary.tsx'), 'utf-8');

describe('the entry on a finished booking', () => {
  it('is drawn only for a role the shared rule lets reach the route', () => {
    expect(summary).toContain("useMayUse('booking.correct')");
    expect(summary).toMatch(/mayCorrect && booking\.appointments\.some\(\(a\) => a\.status === 'completed'\)/);
  });

  it('opens the sheet with only the finished services', () => {
    expect(summary).toMatch(/legs=\{booking\.appointments\.filter\(\(a\) => a\.status === 'completed'\)\}/);
  });

  it('says so when the services cannot be loaded, instead of doing nothing', () => {
    expect(summary).toContain("tfix('loadFailed')");
  });
});

describe('the history under a finished booking', () => {
  it('is read only for a role that may correct, and a failed read shows nothing instead of breaking the receipt', () => {
    expect(summary).toMatch(/if \(!mayCorrect \|\| !firstId\) return/);
    expect(summary).toMatch(/api\.bookingCorrections\(firstId\)\.then\(/);
    expect(summary).toMatch(/, \(\) => \{\}\)/);
  });

  it('shows when, what it was and what it is now, and the reason when there is one', () => {
    expect(summary).toContain("tfix('historyTitle')");
    expect(summary).toContain('ch.beforeService !== ch.afterService');
    expect(summary).toMatch(/c\.reason && /);
  });
});

describe('the correction sheet', () => {
  it('asks again before saving an unusually large amount, and leaves the sheet open when declined', () => {
    expect(sheet).toContain('useLargeAmountGuard');
    expect(sheet).toMatch(/err instanceof LargeAmountDeclined\) return/);
  });

  it('renders the large-amount dialog OUTSIDE the clickable backdrop, so a tap on it cannot close the sheet', () => {
    const backdrop = sheet.indexOf('<div className="modal-backdrop"');
    expect(backdrop).toBeGreaterThan(-1);
    // The dialog follows the backdrop's closing tag, as its sibling, never a child of it.
    expect(sheet).toMatch(/<\/div>\s*\{dialog\}\s*<\/>/);
  });

  it('keeps a retired service selectable under its own name', () => {
    expect(sheet).toMatch(/\{ id: leg\.serviceId \?\? '', name: leg\.serviceName \}/);
  });

  it('does not let a package service be swapped, only its amount fixed', () => {
    expect(sheet).toContain('disabled={Boolean(leg.offerTitle)}');
  });

  it('sends only what changed, and a service only when it differs', () => {
    expect(sheet).toContain('changed.map');
    expect(sheet).toMatch(/row\.serviceId && row\.serviceId !== leg\.serviceId\s*\?\s*\{ serviceId: row\.serviceId \}\s*:\s*\{\}/);
  });

  it('leaves the amount alone when only the service changes — what was paid is not re-priced', () => {
    expect(sheet).toMatch(/onChange=\{\(e\) => patch\(row\.id, \{ serviceId: e\.target\.value \}\)\}/);
  });

  it('keeps the reason optional', () => {
    expect(sheet).toMatch(/reason\.trim\(\)\s*\?\s*\{ reason: reason\.trim\(\) \}\s*:\s*\{\}/);
  });
});
