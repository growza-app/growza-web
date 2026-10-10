import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import { copy } from './copy';

/** Jira GRW-354 — these two moved from copy.ts to the message file so Hindi can have them; the wording rules did not move. */
const reminders = en.settingsReminders;
const offers = en.offers;
/** Jira GRW-438 — packages left Offers, and the claim about booking in chat went with them. */
const packages = en.packages;
const tryIsADemo = en.tryWhatsApp.tryIsADemo;

/**
 * Jira GRW-158 · GRW-165 — the dashboard does not promise what it cannot send.
 *
 * Growza ships as a CRM while Meta approval is outstanding. Everything on the
 * dashboard works; nothing sends a WhatsApp message. `messaging.dispatch()`
 * does not exist, the Meta adapter is an empty class and no worker loop sends
 * anything.
 *
 * The screen this actually cost was Settings → Notifications: an owner could
 * switch on a 24h reminder, press Save, see "Saved", and believe their
 * no-shows were about to drop. The rules WERE stored and `scheduled_message`
 * rows WERE written — and nothing has ever read them.
 *
 * These pin the two states apart. They are string assertions, which is a blunt
 * instrument, and they are not the whole guard — `test/platform/flags-are-read.test.ts`
 * is what stops the flag becoming decorative again. What these catch is the
 * likelier regression: somebody tidying the copy back to the confident version
 * because it reads better.
 */
// Not the reminders notice any more: without WhatsApp the reminders screen is not shown at all (owner, 2026-10-10).
const CRM_ONLY = [tryIsADemo, offers.subtitleCrmOnly, packages.subtitleCrmOnly];

/** Present-tense claims that WhatsApp is working right now. */
const ASSERTS_IT_WORKS = [
  /customers can book/i,
  /bookable (directly )?from whatsapp/i,
  /reminders are going out/i,
  /\bsends? an automatic\b/i,
];

describe('while WhatsApp is off, no copy claims it works', () => {
  it.each(CRM_ONLY)('"%s" makes no present-tense claim', (text) => {
    for (const pattern of ASSERTS_IT_WORKS) expect(text).not.toMatch(pattern);
  });

  it('does not offer reminders at all while they cannot be sent', () => {
    /*
     * BR-02 used to be "coming soon, not hidden": the screen drew with a notice saying the times would start
     * sending later. Superseded (owner, 2026-10-10) — a screen of settings that change nothing is still clutter,
     * so the row is hidden and the page sends anyone without WhatsApp booking back to Settings. Its notice went
     * with it; if it ever comes back, it must not claim reminders are going out.
     */
    expect((reminders as Record<string, unknown>).notLive).toBeUndefined();
    expect((reminders as Record<string, unknown>).savedNotLive).toBeUndefined();
  });

  it('says plainly that customers cannot use the simulator', () => {
    expect(tryIsADemo).toMatch(/cannot|can't/i);
  });

  it('keeps the live wording available for the day it is switched on', () => {
    // The confident copy is not deleted, only conditional. Switching the flag
    // on has to restore the product's own voice, not leave it apologising.
    //
    // Jira GRW-438 — the sentence lives on Packages now. Offers is announcements, which customers READ in
    // chat; a package is what they BOOK, so that is the screen the present-tense claim belongs to.
    expect(packages.subtitleLive).toMatch(/book packages directly from whatsapp/i);
    expect(offers.subtitleLive).toMatch(/whatsapp/i);
  });

  it('the two packages subtitles are genuinely different', () => {
    expect(packages.subtitleCrmOnly).not.toBe(packages.subtitleLive);
  });

  it('the two offers subtitles are genuinely different', () => {
    expect(offers.subtitleCrmOnly).not.toBe(offers.subtitleLive);
  });
});

describe('the nav says which of the two it is showing', () => {
  it('marks the simulator, and marks it with a plain word', () => {
    expect(copy.whatsapp.previewPill).toBe('Demo');
    // The row is 200px wide in the sidebar; a longer marker wrapped it to two
    // lines while every other row stayed on one.
    expect(copy.whatsapp.previewPill.length).toBeLessThanOrEqual(7);
  });

  it('does not say "Try" and "Demo" in the same row', () => {
    expect(copy.whatsapp.navLabelDemo).not.toMatch(/try/i);
    expect(copy.nav.tryWhatsApp).toMatch(/try/i);
  });
});
