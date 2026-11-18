import type { Product } from './api-types';

/**
 * Jira GRW-734 — a dining area's own prices, as the till and the waiter show them on a table's dishes.
 *
 * The SERVER prices the round when it is sent (the API's `areaUnitMinor`, the same rule to the paisa); this copy only
 * lets the screen show what the bill will say before it is sent. A fixed price for the dish wins; else the area's %
 * change, rounded to the whole rupee, half up (₹240 + 10% = ₹264; ₹99 + 10% = ₹109). No rule: the menu price.
 * Takeaway and delivery never come here (AC-02).
 */
export interface AreaPricing {
  /** +10% = 1000; null = menu prices. */
  changeBp: number | null;
  /** Fixed prices by dish id, in paise (whole rupees). */
  fixed: Record<string, number>;
}

export function areaUnitMinor(menuMinor: number, changeBp: number | null, fixedMinor?: number): number {
  if (fixedMinor !== undefined) return fixedMinor;
  if (!changeBp) return menuMinor;
  return Math.floor((menuMinor * (10_000 + changeBp) + 500_000) / 1_000_000) * 100;
}

/** True when the area prices anything differently from the menu. */
export const hasAreaPrices = (p: AreaPricing | null | undefined): p is AreaPricing => Boolean(p && (p.changeBp || Object.keys(p.fixed).length > 0));

/**
 * The menu as the till shows it at a table in this area: each dish at the area's price, and each of its sizes at the
 * area's % change on the size's own price (a dish with sizes takes no fixed price). Add-ons keep their own price.
 */
export function withAreaPrices(products: Product[], pricing: AreaPricing | null | undefined): Product[] {
  if (!hasAreaPrices(pricing)) return products;
  return products.map((p) => {
    const sized = (p.sizes?.length ?? 0) > 0;
    const fixed = sized ? undefined : pricing.fixed[p.id];
    const price = (minor: string | null | undefined) => String(areaUnitMinor(Number(minor ?? 0), pricing.changeBp, fixed));
    return {
      ...p,
      priceMinor: price(p.priceMinor),
      ...(p.sizes ? { sizes: p.sizes.map((s) => (s.priceMinor === null ? s : { ...s, priceMinor: String(areaUnitMinor(Number(s.priceMinor), pricing.changeBp)) })) } : {}),
    };
  });
}

/** "+10%", "−5%", "+12.5%": the area's change as the owner typed it. */
export const changeWords = (bp: number): string => `${bp > 0 ? '+' : '−'}${Math.abs(bp) / 100}%`;
