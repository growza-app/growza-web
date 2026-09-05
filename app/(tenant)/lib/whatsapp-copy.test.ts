import { describe, expect, it } from 'vitest';
import { copy } from './copy';

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
const CRM_ONLY = [copy.whatsapp.remindersNotLive, copy.whatsapp.tryIsADemo, copy.offers.subtitleCrmOnly];

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

  it('tells the owner it is coming, not that something is broken', () => {
    // BR-02 — coming soon, not hidden and not an error. The owner is being
    // sold this; the product should sound like the sales conversation.
    expect(copy.whatsapp.remindersNotLiveTitle).toMatch(/coming soon/i);
    expect(copy.whatsapp.remindersNotLive).toMatch(/will start sending|start sending/i);
  });

  it('promises that setting reminders up now is not wasted work (BR-03)', () => {
    // The rules are stored whatever the flag says, so an owner who configures
    // them in month one has them working the day the switch is flipped. If
    // that ever stops being true, this sentence becomes a lie and the test
    // should be deleted along with the promise.
    expect(copy.whatsapp.remindersNotLive.toLowerCase()).toContain('nothing to redo');
  });

  it('says plainly that customers cannot use the simulator', () => {
    expect(copy.whatsapp.tryIsADemo).toMatch(/cannot|can't/i);
  });

  it('keeps the live wording available for the day it is switched on', () => {
    // The confident copy is not deleted, only conditional. Switching the flag
    // on has to restore the product's own voice, not leave it apologising.
    expect(copy.offers.subtitleLive).toMatch(/book combos directly from whatsapp/i);
  });

  it('the two offers subtitles are genuinely different', () => {
    expect(copy.offers.subtitleCrmOnly).not.toBe(copy.offers.subtitleLive);
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
