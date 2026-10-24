import type { Areas } from './areas';

/**
 * Owner, 2026-10-24 — the channels a business's orders can come from, in the order its screens list them.
 *
 * Two kinds, and a business has whichever its vertical gives it (`Areas`, from `/me`):
 *   - the MARKETPLACES (Flipkart, Amazon): orders imported, packed, shipped, and sometimes sent back undelivered;
 *   - the DELIVERY APPS (Swiggy, Zomato): orders the till rings up, done when the rider takes them.
 * The counter is everyone's. No screen asks what kind of business this is; it asks this.
 */
export const MARKETPLACE_CHANNELS = ['flipkart', 'amazon'] as const;
export const DELIVERY_APP_CHANNELS = ['swiggy', 'zomato'] as const;

type ChannelAreas = Pick<Areas, 'marketplaces' | 'deliveryApps'>;

/** Does the business sell on marketplaces — and so pack, ship, and get parcels back? Absent reads as yes, as before. */
export const sellsOnMarketplaces = (areas: ChannelAreas): boolean => areas.marketplaces !== false;

/** Counter first, then the marketplaces it sells on, then its delivery apps. */
export function channelsOf(areas: ChannelAreas): string[] {
  return ['counter', ...(sellsOnMarketplaces(areas) ? MARKETPLACE_CHANNELS : []), ...(areas.deliveryApps ?? [])];
}

/** An order from a delivery app: rung up at the till, never shipped, never told anything. */
export const isDeliveryApp = (channel: string): boolean => (DELIVERY_APP_CHANNELS as readonly string[]).includes(channel);
