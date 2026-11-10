import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shareReachesSomeone, wasPriceMinor, type ShareSession } from './share-on-whatsapp';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/** QA 10 Nov 2026 — the two GRW-671 loopholes fixed before release: a "was" that can grow, and a message with no way back. */
const session = (over: Partial<ShareSession> = {}): ShareSession => ({
  lang: 'en',
  tone: 'neutral',
  businessName: 'Glow Studio',
  businessPhone: null,
  timezone: 'Asia/Kolkata',
  branches: [{ id: 'b1', name: 'Main Road', phone: null, mapsUrl: null } as ShareSession['branches'][number]],
  bookingLive: false,
  ...over,
});

describe('the "was" a package quotes', () => {
  it('is the lower of today and when it was made: a later price rise never grows the saving', () => {
    expect(wasPriceMinor(150_000, '125000')).toBe(125_000);
  });
  it('follows a later price cut down', () => {
    expect(wasPriceMinor(110_000, '125000')).toBe(110_000);
  });
  it('is today’s price from an older API that remembers nothing', () => {
    expect(wasPriceMinor(125_000, undefined)).toBe(125_000);
    expect(wasPriceMinor(125_000, null)).toBe(125_000);
  });
});

describe('a message that tells a client how to reach the business', () => {
  it('has none with no phone anywhere and no booking link', () => {
    expect(shareReachesSomeone({ branchId: 'b1', bookable: true }, session())).toBe(false);
  });
  it('has the branch’s phone, or else the business’s', () => {
    expect(shareReachesSomeone({ branchId: 'b1', bookable: false }, session({ businessPhone: '+919829012345' }))).toBe(true);
    const branches = [{ id: 'b1', name: 'Main Road', phone: '9829012345', mapsUrl: null } as ShareSession['branches'][number]];
    expect(shareReachesSomeone({ branchId: 'b1', bookable: false }, session({ branches }))).toBe(true);
  });
  it('does not count a number WhatsApp could not dial', () => {
    expect(shareReachesSomeone({ branchId: 'b1', bookable: false }, session({ businessPhone: '12345' }))).toBe(false);
  });
});

describe('the button asks, it never blocks', () => {
  const src = readFileSync(resolve(__dirname, '../components/ShareOnWhatsApp.tsx'), 'utf8');
  it('asks once a session, offers Share anyway to everyone, and Add number only to who may open Settings', () => {
    expect(src).toContain('!shareReachesSomeone({ branchId: target.branchId, bookable: target.bookable }, session)');
    expect(src).toContain("window.sessionStorage.setItem(WAIVED_KEY, '1')");
    expect(src).toContain("canSee('/settings/profile'");
    expect(src).toContain('void share(true);');
  });
  it('in English and Hindi', () => {
    for (const lang of [en, hi]) {
      for (const k of ['noNumberTitle', 'noNumberBody', 'noNumberBodyStaff', 'shareAnyway', 'addNumber']) expect((lang.share as Record<string, string>)[k], k).toBeTruthy();
    }
  });
  it('Packages quotes the lower "was"', () => {
    expect(readFileSync(resolve(__dirname, '../packages/PackagesList.tsx'), 'utf8')).toContain('wasPriceMinor(partsTotalMinor(parts), pkg.partsWhenMadeMinor)');
  });
});
