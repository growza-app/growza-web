import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enMessages from '../../../messages/en.json';
import hiMessages from '../../../messages/hi.json';
import { SETTINGS_GROUPS } from './nav-data';
import { BOOKING_RULE_KEYS, WHATSAPP_ONLY_BOOKING_KEYS, bookingRuleKeys } from './branch-keys';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');
const navList = read('SettingsNavList.tsx');
const booking = read('booking/BookingRulesForm.tsx');
const branches = read('branches/BranchesForm.tsx');
const team = read('team/TeamAccessPanel.tsx');
const session = read('../components/SessionProvider.tsx');
const bookingPage = read('booking/page.tsx');
const bookingNote = read('booking/BookingScopeNote.tsx');
const remindersPage = read('notifications/page.tsx');
const reminders = read('notifications/RemindersForm.tsx');
const css = read('../styles/84-business-profile.css') + read('../styles/85-settings-fit.css');
const rows = SETTINGS_GROUPS.flatMap((g) => g.rows);

/*
 * Owner, 2026-10-10 — Settings looked complex, and an audit found why: a row that opened a page another row
 * already opened, four settings that changed nothing while WhatsApp is off, every branch drawn as a full form
 * repeating Branch profile, and every receptionist listed twice. These pin the simpler shape.
 */
describe('Settings, simpler', () => {
  it('lists each destination once — no second row for the booking page', () => {
    expect(rows.filter((r) => r.href === '/settings/booking')).toHaveLength(1);
    expect(rows.map((r) => r.key)).not.toContain('cancellationPolicy');
    for (const m of [enMessages, hiMessages]) {
      expect((m.settingsHub.rows as Record<string, unknown>).cancellationPolicy).toBeUndefined();
    }
  });

  it('offers what only binds a WhatsApp booking only while WhatsApp booking is on', () => {
    // Unknown reads as off: a setting that does nothing is not offered on a guess.
    expect(session).toMatch(/return useSession\(\)\?\.whatsappLive \?\? false;/);
    // Reminders are sent by WhatsApp and nothing else.
    expect(rows.find((r) => r.key === 'notifications')?.whatsappOnly).toBe(true);
    expect(navList).toMatch(/\(!row\.whatsappOnly \|\| whatsappLive\)/);
    // Notice, horizon and cancel cutoff bind a client by WhatsApp; the desk gets 0 notice and cancels any time.
    expect(WHATSAPP_ONLY_BOOKING_KEYS).toEqual(['min_notice_min', 'booking_horizon_days', 'cancellation_cutoff_min']);
    for (const [key, id] of [['min_notice_min', 'rule-notice'], ['booking_horizon_days', 'rule-horizon'], ['cancellation_cutoff_min', 'rule-cutoff']]) {
      expect(booking).toMatch(new RegExp(`\\{shows\\('${key}'\\) \\? \\(\\s*<div[^>]*>\\s*<label htmlFor="${id}">`));
    }
    // What the desk's own booking does use stays: the slot pattern and the closed days.
    expect(booking).not.toMatch(/shows\('slot/);
    expect(booking).toMatch(/className="field closed-days"/);
    // "Copy to all", "Use the usual settings" and "has its own" act on exactly the rules the form draws, from the
    // same session answer: the page's own /me call could disagree with the form (review, 2026-10-10).
    expect(bookingRuleKeys(false)).toEqual(['slot_granularity_min', 'slot_policy']);
    expect(bookingRuleKeys(true)).toEqual(BOOKING_RULE_KEYS);
    expect(bookingNote).toMatch(/const whatsappLive = useWhatsappLive\(\);/);
    expect(bookingPage).not.toMatch(/api\.me\(\)/);
    // "Right after other bookings" ignores the interval, so its hint says so instead of a spacing.
    expect(booking).toMatch(/slotPolicy === 'gap_packed' \? t\('slotHintGap'\)/);
  });

  it('does not open the reminders screen without WhatsApp, even from a bookmark', () => {
    // Only a /me that answered "off" redirects — keeping the branch; a failed one shows the screen.
    expect(remindersPage).toMatch(/if \(me && !me\.whatsapp\?\.booking\) \{/);
    expect(remindersPage).toMatch(/redirect\(withBranch\('\/settings', /);
    // The not-live half of the form went with it rather than staying behind as code nothing reaches.
    expect(reminders).not.toMatch(/whatsappLive|notLive|savedNotLive/);
  });

  it('draws each branch as one row that opens its Branch profile, with no form of its own', () => {
    expect(branches).not.toMatch(/<input(?![^>]*readOnly)/); // the booking link's read-only box is the only input
    expect(branches).not.toMatch(/saveBranch|api\.updateBranch/);
    expect(branches).toMatch(/href=\{withBranch\('\/settings\/profile', branch\.id\)\}/);
    // Make main and Close stay: they are about the set of branches, not one branch's details.
    expect(branches).toMatch(/setAction\('make-main'\)/);
    expect(branches).toMatch(/setAction\('close'\)/);
    // The booking link is a WhatsApp link — and in the demo, its "Try it" is the way into the try-out.
    expect(branches).toMatch(/\{whatsappLive \|\| demo \? <BookingLink /);
    // The row's own words are its accessible name: an aria-label would hide "Main" and the staff count.
    expect(branches).not.toMatch(/aria-label=\{t\('editAria'/);
    // The cards' CSS went with the cards.
    expect(css).not.toMatch(/\.bp-branch-title|\.bp-card-actions|\.bp-branches|\.bp-branch-actions/);
  });

  it('lists each person who can sign in once, with a receptionist’s branch on their own row', () => {
    expect(team).not.toMatch(/t\('receptionists'\)/);
    expect(team.match(/onChange=\{\(e\) => void moveMember\(/g)).toHaveLength(1);
    expect(team).toMatch(/\{multiBranch && m\.role === 'receptionist' \? \(\s*<select/);
    // No branch means every branch: the select says so instead of a blank that reads as unassigned.
    expect(team).toMatch(/\{!m\.locationId && <option value="">\{t\('everyBranch'\)\}<\/option>\}/);
    for (const m of [enMessages, hiMessages]) {
      const w = m.settingsTeam as Record<string, unknown>;
      expect(w.receptionists).toBeUndefined();
      expect(w.worksAt).toBeUndefined();
      expect(w.everyBranch).toBeTruthy();
    }
  });
});
