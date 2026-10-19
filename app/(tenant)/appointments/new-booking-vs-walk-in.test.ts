import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-19 — "on desktop, Walk-in and New booking open the same page".
 *
 * One page serves both: `/appointments/new` starts on "Starts now" unless the link says `?mode=later`. The owner's
 * "New booking" links said nothing, so they opened as a walk-in. A booking is for a time, so those links ask for
 * "Pick a time"; the walk-in links keep asking for now.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('New booking opens on Pick a time, Walk-in on Starts now', () => {
  const bookings = read('BookingsList.tsx');
  const owner = read('../components/home/OwnerHome.tsx');
  const reception = read('../components/home/ReceptionHome.tsx');

  it('every New booking link asks for a time', () => {
    expect(bookings).toContain('className="btn btn-primary bk-cmd-new-btn" href="/appointments/new?mode=later"');
    expect(owner).toContain('href="/appointments/new?mode=later" className="hm-action hm-action-dark"');
    expect(reception).toContain('href="/appointments/new?mode=later" className="hm-action tb-new-booking hm-desktop"');
  });

  it('the Quick actions card has Walk-in and Sales, no second New booking (the header button is the one)', () => {
    const card = owner.slice(owner.indexOf('hm-v3-qgrid'), owner.indexOf('Needs your attention (Bookings, Queue'));
    expect(card).not.toContain('t.nav.newBooking');
    expect(owner).toContain('className="hm-v3-qbtn is-green" href="/sales"');
  });

  it('every Walk-in link asks for now', () => {
    expect(bookings).toContain('className="btn bk-cmd-walkin-btn" href="/appointments/new?mode=now"');
    expect(owner).toContain('className="hm-v3-qbtn is-mint" href="/appointments/new?mode=now"');
    expect(reception).toContain("href: '/appointments/new?mode=now', label: t.walkInShort");
  });

  it('no screen links to the bare page, which is the walk-in', () => {
    for (const src of [bookings, owner, reception]) expect(src).not.toMatch(/href="\/appointments\/new"/);
  });

  it('the page itself still defaults to now, so older links keep working', () => {
    expect(read('new/page.tsx')).toContain("params.mode === 'later' ? 'later' : 'now'");
  });
});
