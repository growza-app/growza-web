import type { BillOffer } from '../lib/api-types';

/**
 * Owner, 2026-11-26 — the "we miss you" messages an owner sends to regulars who are overdue, from the restaurant's
 * Reports › Guests. The owner's own words (2026-11-26), with the restaurant's name in each, and the guest's most-ordered
 * dish where the words say "{favourite dish}". No guest's name and no "Hi". English only, whatever language the
 * dashboard is in — these are the guest's words, not the dashboard's, so they are not in messages/*.json.
 *
 * Sent as a `wa.me` link from the owner's own WhatsApp; nothing is sent by the product.
 */
export const MISS_YOU_KINDS = ['miss', 'craving', 'offer'] as const;
export type MissYouKind = (typeof MISS_YOU_KINDS)[number];

/** Where the words name the guest's dish. Left in the editable message so the owner can move it. */
export const DISH = '{favourite dish}';

const place = (business: string | null | undefined) => business?.trim() || 'us';
const rupees = (minor: number) => `₹${Math.round(minor / 100).toLocaleString('en-IN')}`;

/** What a coupon or buy-get offer gives, as the end of "…and enjoy ___". Null when it cannot be said plainly. */
export function offerPhrase(offer: BillOffer): string | null {
  if (offer.kind === 'bogo') {
    if (!offer.buyQty || !offer.getQty || !offer.productName) return null;
    return offer.buyQty === 1 && offer.getQty === 1
      ? `a free ${offer.productName} when you buy one`
      : `${offer.getQty} free ${offer.productName} when you buy ${offer.buyQty}`;
  }
  const off = offer.offBp ? `${Math.round(offer.offBp / 100)}% off` : offer.offMinor ? `${rupees(offer.offMinor)} off` : null;
  if (!off) return null;
  const min = offer.minBillMinor > 0 ? ` on orders above ${rupees(offer.minBillMinor)}` : '';
  return offer.code ? `${off}${min} with code ${offer.code}` : `${off}${min}`;
}

/** The offers a guest could use today: started, not ended, and sayable in one line. */
export function offersToSend(offers: readonly BillOffer[], todayISO: string): BillOffer[] {
  return offers.filter(
    (o) => (!o.validFrom || o.validFrom.slice(0, 10) <= todayISO) && (!o.validUntil || o.validUntil.slice(0, 10) >= todayISO) && offerPhrase(o) !== null,
  );
}

/** The words for one kind, with the restaurant named and `{favourite dish}` left for each guest. */
export function missYouTemplate(kind: MissYouKind, business: string | null | undefined, offer?: BillOffer | null): string {
  const at = place(business);
  const treat = kind === 'offer' && offer ? offerPhrase(offer) : null;
  if (treat) return `We miss seeing you! Come back to ${at} this week and enjoy ${treat}. Hope to see you soon!`;
  if (kind === 'craving') return `Craving ${DISH}? We'd be happy to make it for you again at ${at}. Drop by or order whenever you're ready 🍽️`;
  return `It's been a little while since we saw you at ${at} 😊 We'd love to welcome you back. Your usual ${DISH} is waiting!`;
}

/** A dish's name for a message: the size on the bill ("(Full)", "(Half)") is not part of what they crave. */
export const dishForMessage = (name: string | null | undefined) => name?.replace(/\s*\([^)]*\)\s*$/, '').trim() || null;

/** One guest's message: their dish where the words say {favourite dish}, or "your usual order" when they have none. */
export function missYouFor(template: string, favouriteDish: string | null | undefined): string {
  const dish = dishForMessage(favouriteDish);
  if (dish) return template.split(DISH).join(dish);
  return template
    .split(`Your usual ${DISH}`).join('Your usual order')
    .split(`your usual ${DISH}`).join('your usual order')
    .split(DISH).join('your usual order');
}
