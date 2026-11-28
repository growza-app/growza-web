import { shopPlace } from './points-reminder';

/**
 * Owner, 2026-11-28 — the WhatsApp line each growth list opens with (GrowthLists.tsx). The customer's words, not the
 * dashboard's: English only, no name, no "Hi" (the owner's rule for every message to a customer), the shop's name in
 * each. Sent from the owner's own WhatsApp as a `wa.me` link; nothing is sent by the product.
 */
export type GrowthKind = 'once' | 'less' | 'season';

export function growthMessage(kind: GrowthKind, business: string | null | undefined): string {
  const shop = shopPlace(business);
  if (kind === 'once') return `Thank you for shopping at ${shop}. New stock is in. Come in and see what is new.`;
  if (kind === 'less') return `New stock is in at ${shop}. Come in this week and see what is new.`;
  return `It is that time of the year again. New stock is in at ${shop}. Come in before it sells out.`;
}
