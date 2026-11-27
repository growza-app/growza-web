import { useTranslations } from 'next-intl';

/**
 * Owner, 2026-11-28 — a retail shop's Reports › Customers is the restaurant's Guests tab in the shop's own words: a
 * restaurant has guests who order dishes, a shop has customers who buy products. The same components draw both; only
 * the words differ, and which words is passed in by the screen (never asked of the business's type).
 *
 * The shop's sentences are `shopCustomers` in messages/*.json, the same keys as `restaurantReports.customers` with the
 * same placeholders (`shop-customers.test.ts` holds that), so the restaurant's typed translator stands for either.
 */
export type CustomerWords = 'restaurant' | 'shop';

/** `restaurantReports.customers`, or the shop's `shopCustomers`. */
export function useCustomersWords(words: CustomerWords) {
  const restaurant = useTranslations('restaurantReports.customers');
  const shop = useTranslations('shopCustomers');
  return words === 'shop' ? (shop as unknown as typeof restaurant) : restaurant;
}

/** The "we miss you" sheet's words. */
export function useMissYouWords(words: CustomerWords) {
  const restaurant = useTranslations('restaurantReports.customers.missYou');
  const shop = useTranslations('shopCustomers.missYou');
  return words === 'shop' ? (shop as unknown as typeof restaurant) : restaurant;
}

/** The points-waiting list's and sheet's words. */
export function usePointsWords(words: CustomerWords) {
  const restaurant = useTranslations('restaurantReports.customers.points');
  const shop = useTranslations('shopCustomers.points');
  return words === 'shop' ? (shop as unknown as typeof restaurant) : restaurant;
}

/** The fans list's and sheet's words: fans of a dish, or of a product. */
export function useFansWords(words: CustomerWords) {
  const restaurant = useTranslations('restaurantReports.customers.fans');
  const shop = useTranslations('shopCustomers.fans');
  return words === 'shop' ? (shop as unknown as typeof restaurant) : restaurant;
}
