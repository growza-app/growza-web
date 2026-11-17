/**
 * Jira GRW-739 — the food-cost colours (owner, 2026-11-18): above 35% is amber, above 45% red, and anything else plain. One rule, used by the
 * dish sheet's "Costs ₹85 · 24%" line and every percentage on Reports › Food cost, so a dish never reads amber in one place and plain in
 * another. No % (a ₹0 dish, no recipe, no price yet) has no colour: it is never shown as "good".
 */
export const FOOD_COST_AMBER_ABOVE = 35;
export const FOOD_COST_RED_ABOVE = 45;

export type FoodCostTone = 'ok' | 'warn' | 'bad' | 'none';

export function foodCostTone(pct: number | null | undefined): FoodCostTone {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 'none';
  if (pct > FOOD_COST_RED_ABOVE) return 'bad';
  if (pct > FOOD_COST_AMBER_ABOVE) return 'warn';
  return 'ok';
}

/** "23.6%", "24%" (a whole number keeps no ".0"), or "—" when there is no %. */
export function pctText(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}
