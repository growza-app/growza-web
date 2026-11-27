import type { BillOffer } from '../lib/api-types';
import type { CustomerWords } from './customer-words';
import { shopPlace, shortDay } from './points-reminder';

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
/** Owner, 2026-11-28 — a shop's: where the words name the customer's most-bought product. */
export const PRODUCT = '{product}';

/** The placeholder these words fill per person: the guest's dish, or the customer's product. */
export const placeholderOf = (words: CustomerWords = 'restaurant') => (words === 'shop' ? PRODUCT : DISH);

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

/**
 * The offers a guest could use today: started, not ended, sayable in one line — and with no limit per guest. A
 * once-per-guest offer may already be used by the guest it goes to, and the sheet cannot know who has: promising it
 * would send them to a till that refuses it (review, 2026-11-27).
 */
export function offersToSend(offers: readonly BillOffer[], todayISO: string): BillOffer[] {
  return offers.filter(
    (o) =>
      (!o.validFrom || o.validFrom.slice(0, 10) <= todayISO) &&
      (!o.validUntil || o.validUntil.slice(0, 10) >= todayISO) &&
      o.usesPerGuest === null &&
      offerPhrase(o) !== null,
  );
}

/** "this week", unless the offer ends sooner: then "today", or "by 30 Nov" — never a promise past its last day. */
function until(offer: BillOffer, todayISO: string | undefined): string {
  const last = offer.validUntil?.slice(0, 10);
  if (!last || !todayISO) return 'this week';
  const days = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'today';
  return days < 6 ? `by ${shortDay(last)}` : 'this week';
}

/**
 * The words for one kind, with the restaurant named and `{favourite dish}` left for each guest.
 *
 * Owner, 2026-11-28 — a shop's (`words: 'shop'`) are its own, by the same rules: no name, no "Hi", the shop named, no food
 * and no emoji, direct. The third kind (`craving`) is the customer's product there — "Their product" on the chip.
 */
export function missYouTemplate(
  kind: MissYouKind,
  business: string | null | undefined,
  offer?: BillOffer | null,
  todayISO?: string,
  words: CustomerWords = 'restaurant',
): string {
  const treat = kind === 'offer' && offer ? offerPhrase(offer) : null;
  if (words === 'shop') {
    const shop = shopPlace(business);
    if (treat && offer) return `We miss you at ${shop}. Come back ${until(offer, todayISO)} and get ${treat}.`;
    // Review, 2026-11-28 — nothing here may say the product is in stock: the sheet does not know.
    if (kind === 'craving') return `Need another ${PRODUCT}? Come back to ${shop} this week.`;
    return `We miss you at ${shop}. Drop by this week.`;
  }
  const at = place(business);
  if (treat && offer) return `We miss seeing you! Come back to ${at} ${until(offer, todayISO)} and enjoy ${treat}. Hope to see you soon!`;
  if (kind === 'craving') return `Craving ${DISH}? We'd be happy to make it for you again at ${at}. Drop by or order whenever you're ready 🍽️`;
  return `It's been a little while since we saw you at ${at} 😊 We'd love to welcome you back. Your usual ${DISH} is waiting!`;
}

/**
 * A dish's (or product's) name for a message: what they crave, not how the bill wrote it.
 *
 * First an add-on the API wrote onto the line's name (`${name} + ${addonLabel}`: "Masala Dosa + Extra cheese",
 * "Running Shoe (UK 9) + Gift wrap") is dropped — review, 2026-11-28: "Craving Masala Dosa + Extra cheese?" — then the
 * size in brackets at the end ("(Full)", "(Half)", "(UK 9)"). Known and accepted: a bracket that is part of the real name
 * ("Jersey (Home)") goes too; the bill gives no way to tell the two apart.
 */
export const dishForMessage = (name: string | null | undefined) =>
  name
    ?.replace(/\s+\+\s.*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim() || null;

/**
 * One guest's message: their dish where the words say {favourite dish}, or "your usual order" when they have none.
 * A shop's: their product where the words say {product}, or "your usual" when they have none.
 */
export function missYouFor(template: string, favouriteDish: string | null | undefined, words: CustomerWords = 'restaurant'): string {
  const dish = dishForMessage(favouriteDish);
  if (words === 'shop') {
    if (dish) return template.split(PRODUCT).join(dish);
    return template.split(`Need another ${PRODUCT}?`).join('Need more of your usual?').split(PRODUCT).join('your usual');
  }
  if (dish) return template.split(DISH).join(dish);
  return template
    .split(`Your usual ${DISH}`).join('Your usual order')
    .split(`your usual ${DISH}`).join('your usual order')
    .split(DISH).join('your usual order');
}

/**
 * Owner, 2026-11-28 — the two functions above in one business's words, for a screen that draws either: it takes them
 * once (`const { missYouFor, missYouTemplate } = missYouIn(words)`) and every call reads as the restaurant's always did.
 */
export function missYouIn(words: CustomerWords) {
  return {
    missYouTemplate: (kind: MissYouKind, business: string | null | undefined, offer?: BillOffer | null, todayISO?: string) =>
      missYouTemplate(kind, business, offer, todayISO, words),
    missYouFor: (template: string, favouriteDish: string | null | undefined) => missYouFor(template, favouriteDish, words),
  };
}
