import type { CustomerWords } from './customer-words';
import { dishForMessage } from './miss-you';
import { shopPlace } from './points-reminder';

/**
 * Owner, 2026-11-27 — "fans of a dish who have not come back in 15 days": the message an owner sends to the guests who
 * keep ordering one dish and have not been in for a while, from Reports › Guests. Like the "we miss you" messages: no
 * guest's name, no "Hi", English only (the guest's words, not the dashboard's), sent as a `wa.me` link from the owner's
 * own WhatsApp. Everyone in the list shares the dish, so the words name it outright — no placeholder to fill per guest.
 */
const place = (business: string | null | undefined) => business?.trim() || 'us';

/** The dish as a guest says it: the size on the bill ("(Full)", "(Half)") dropped. */
export const fanDish = (dish: string) => dishForMessage(dish) ?? dish;

/**
 * Owner, 2026-11-28 — a shop's fans of a product get the shop's words: the shop named, no food, no emoji — and nothing
 * that says the product is in stock (review, 2026-11-28: the sheet does not know).
 */
export function dishFansTemplate(dish: string, business: string | null | undefined, words: CustomerWords = 'restaurant'): string {
  if (words === 'shop') return `Come back to ${shopPlace(business)} for another ${fanDish(dish)} this week.`;
  return `Craving ${fanDish(dish)}? Your favourite is waiting at ${place(business)}. Come in or order this week 🍽️`;
}
