import type { DeliveryAppTallyRow, DeliveryTallyRange } from './api-types';

/**
 * Jira GRW-658 — what the Payout card on Orders says, as plain functions so the rule is read in one place and tested without a browser.
 *
 * The card never works a rupee out itself: the API sends the figures. What lives here is which SENTENCE a row earns, and how a percentage
 * the owner types becomes the one the API stores.
 */

/** The weeks an app pays by, then the day and the month. The API takes more (a custom range); the card offers these four. */
export const PAYOUT_RANGES: readonly DeliveryTallyRange[] = ['this_week', 'last_week', 'today', 'this_month'];
export const DEFAULT_PAYOUT_RANGE: DeliveryTallyRange = 'this_week';

/** The most an app may take, as the API holds it. */
export const MAX_COMMISSION_PERCENT = 50;

/**
 * What a row says:
 *  - `empty`   — no orders from this app in the range;
 *  - `unset`   — orders, and no commission to work with: the order total alone, and the way to add one;
 *  - `partial` — some orders were entered before a commission was set, so no honest "should pay you";
 *  - `ready`   — every order carries a commission: total, commission, and what the app should pay.
 */
export type PayoutRowState = 'empty' | 'unset' | 'partial' | 'ready';

export function payoutRowState(row: Pick<DeliveryAppTallyRow, 'orders' | 'shouldPayMinor' | 'ordersWithoutCommission' | 'commissionMinor'>): PayoutRowState {
  if (row.orders === 0) return 'empty';
  if (row.shouldPayMinor !== null) return 'ready';
  // Orders and a commission on none of them is the plain "not set"; a commission on only some is the mixed case.
  return row.ordersWithoutCommission >= row.orders ? 'unset' : 'partial';
}

/** 2200 → "22", 2256 → "22.56", 250 → "2.5": the percentage as a person writes it, without a trailing zero. */
export function percentText(bp: number | null): string {
  if (bp === null) return '';
  return String(Number((bp / 100).toFixed(2)));
}

export type PercentInput = { ok: true; percent: number | null } | { ok: false };

/**
 * What the owner typed. Empty clears the commission (`null`); a comma is accepted as a decimal point; anything that is not a number from
 * 0 to 50 is refused, with the same sentence the API gives. Two places are kept; the API rounds the rest.
 */
export function parsePercent(text: string): PercentInput {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return { ok: true, percent: null };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > MAX_COMMISSION_PERCENT) return { ok: false };
  return { ok: true, percent: value };
}

/**
 * Jira GRW-679 (UX-06) — the card in one line, for a phone that shows it folded: "Swiggy ₹4,120 · Zomato ₹2,300".
 *
 * Only the apps whose figure is whole (`ready`): an app with no commission set, or with some orders missing one,
 * has no "should pay you" to quote, and a line that quoted the order total in its place would read as what is owed.
 * Empty when no app has one — the folded card then shows its title alone.
 */
export function payoutSummary(rows: readonly DeliveryAppTallyRow[], name: (app: DeliveryAppTallyRow['app']) => string, money: (minor: string | null) => string): string {
  return rows
    .filter((row) => payoutRowState(row) === 'ready')
    .map((row) => `${name(row.app)} ${money(row.shouldPayMinor)}`)
    .join(' · ');
}
