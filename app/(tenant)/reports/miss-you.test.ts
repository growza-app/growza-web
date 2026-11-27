import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BillOffer } from '../lib/api-types';
import { DISH, MISS_YOU_KINDS, dishForMessage, missYouFor, missYouTemplate, offerPhrase, offersToSend } from './miss-you';

const code = (p: string) =>
  readFileSync(resolve(__dirname, p), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const offer = (o: Partial<BillOffer>): BillOffer => ({
  id: 'o1', kind: 'coupon', name: 'Come back', code: null, offBp: null, offMinor: null, minBillMinor: 0, usesPerGuest: null,
  productId: null, productName: null, buyQty: null, getQty: null, validFrom: null, validUntil: null, used: 0, ...o,
});

/** Owner, 2026-11-26 — the owner's three messages: the restaurant named, the guest's most-ordered dish, no name, no "Hi". */
describe('the miss-you messages', () => {
  it('are the owner’s words, with the restaurant named in each', () => {
    expect([...MISS_YOU_KINDS]).toEqual(['miss', 'craving', 'offer']);
    expect(missYouTemplate('miss', 'Spice Garden')).toBe(`It's been a little while since we saw you at Spice Garden 😊 We'd love to welcome you back. Your usual ${DISH} is waiting!`);
    expect(missYouTemplate('craving', 'Spice Garden')).toBe(`Craving ${DISH}? We'd be happy to make it for you again at Spice Garden. Drop by or order whenever you're ready 🍽️`);
    expect(missYouTemplate('offer', 'Spice Garden', offer({ code: 'BACK10', offBp: 1000 }))).toBe(
      'We miss seeing you! Come back to Spice Garden this week and enjoy 10% off with code BACK10. Hope to see you soon!',
    );
  });

  it('never name the guest or open with a greeting', () => {
    for (const k of MISS_YOU_KINDS) expect(missYouFor(missYouTemplate(k, 'Spice Garden', offer({ offBp: 1000 })), 'Masala Dosa'), k).not.toMatch(/^(hi|hello|dear)\b/i);
  });

  it('put in each guest’s most-ordered dish, without the size, and "your usual order" when they have none', () => {
    const miss = missYouTemplate('miss', 'Spice Garden');
    const craving = missYouTemplate('craving', 'Spice Garden');
    expect(missYouFor(miss, 'Tandoori Chicken (Full)')).toContain('Your usual Tandoori Chicken is waiting!');
    expect(missYouFor(craving, 'Masala Dosa')).toMatch(/^Craving Masala Dosa\?/);
    expect(missYouFor(miss, null)).toContain('Your usual order is waiting!');
    expect(missYouFor(craving, null)).toMatch(/^Craving your usual order\?/);
    expect(missYouFor(miss, 'Masala Dosa')).not.toContain('{');
    expect(dishForMessage('Butter Chicken (Half)')).toBe('Butter Chicken');
  });

  it('say the offer the till will apply', () => {
    expect(offerPhrase(offer({ offMinor: 5000, minBillMinor: 30000 }))).toBe('₹50 off on orders above ₹300');
    expect(offerPhrase(offer({ kind: 'bogo', buyQty: 1, getQty: 1, productName: 'Masala Dosa' }))).toBe('a free Masala Dosa when you buy one');
    expect(offerPhrase(offer({ kind: 'bogo', buyQty: 2, getQty: 1, productName: 'Lassi' }))).toBe('1 free Lassi when you buy 2');
    expect(offerPhrase(offer({}))).toBeNull();
    expect(missYouTemplate('offer', 'Spice Garden', null)).toBe(missYouTemplate('miss', 'Spice Garden'));
  });

  it('offer only what a guest can use today', () => {
    const list = [offer({ id: 'live', offBp: 1000 }), offer({ id: 'ended', offBp: 1000, validUntil: '2026-11-20' }), offer({ id: 'later', offBp: 1000, validFrom: '2026-12-01' }), offer({ id: 'blank' })];
    expect(offersToSend(list, '2026-11-26').map((o) => o.id)).toEqual(['live']);
  });

  it('never promise a once-per-guest offer, nor a week the offer does not last (review, 2026-11-27)', () => {
    expect(offersToSend([offer({ id: 'once', offBp: 1000, usesPerGuest: 1 })], '2026-11-27')).toEqual([]);
    const tenOff = (validUntil: string | null) => missYouTemplate('offer', 'Spice Garden', offer({ offBp: 1000, validUntil }), '2026-11-27');
    expect(tenOff(null)).toContain('Come back to Spice Garden this week and enjoy 10% off');
    expect(tenOff('2026-12-31')).toContain(' this week ');
    expect(tenOff('2026-11-29')).toContain('Come back to Spice Garden by 29 Nov and enjoy');
    expect(tenOff('2026-11-27')).toContain('Come back to Spice Garden today and enjoy');
  });

  it('with every branch picked, no branch\'s offer is named (it would be refused at the others)', () => {
    expect(code('RestaurantReports.tsx')).toContain('const offersAt = branchContext.multi ? branchContext.choice : (session?.branches?.[0]?.id ?? null);');
  });

  it('are offered from the overdue card; each row and each Send fills in that guest’s dish', () => {
    const rr = code('RestaurantReports.tsx');
    expect(rr).toContain("{t('missYou.open')}");
    expect(rr).toContain("missYouFor(missYouTemplate('miss', business), g.favouriteDish)");
    expect(rr).not.toContain("t('overdueHello'");
    const sheet = code('MissYouSheet.tsx');
    expect(sheet).toContain("whatsappHref(g.phone.replace(/\\D/g, ''), missYouFor(message, g.favouriteDish))");
    expect(sheet).toContain("MISS_YOU_KINDS.filter((k) => k !== 'offer' || offers.length > 0)");
  });
});
