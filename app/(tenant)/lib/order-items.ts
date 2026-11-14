import type { OrderListRow } from './api-types';

/**
 * QA 2026-11-14, F14 — everything on it came back: the row says "2 items · all came back", not "₹0 · No items" about
 * an order that had two. Needs the API's `itemsSold`; an older API keeps the old words.
 */
export const allCameBack = (r: Pick<OrderListRow, 'items' | 'itemsSold'>): r is Pick<OrderListRow, 'items'> & { itemsSold: number } =>
  r.items <= 0 && (r.itemsSold ?? 0) > 0;
