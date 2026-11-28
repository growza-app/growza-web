import { redirect } from 'next/navigation';
import { api } from './api';
import { areasOf } from './areas';

/**
 * Jira GRW-758 — a restaurant reads its Reports as tabs (Overview · Sales · Items · Inventory). Its old report addresses
 * (Profit, Payments, Discounts, Sales by channel, Top sellers) are each a part of one tab now, so a bookmark or an old link
 * opens that tab rather than a screen the restaurant no longer shows. A retail shop keeps every one of them.
 * Owner, 2026-11-28 — a shop's Customers is the restaurant's Guests tab, so a restaurant at that address opens Guests.
 */
export async function sendRestaurantToTab(view: 'overview' | 'sales' | 'items' | 'customers', shopView?: 'overview' | 'sales' | 'customers' | 'products'): Promise<void> {
  let target: string | null = null;
  try {
    const areas = areasOf(await api.me());
    if (areas.tables === true) target = view;
    // Owner, 2026-11-28 — a shop reads six tabs too (ShopReports.tsx): an old address opens the tab its figures are on.
    else if (shopView && areas.shop && !areas.bookings) target = shopView;
  } catch {
    return;
  }
  // Outside the try: `redirect()` works by throwing.
  if (target) redirect(`/reports?view=${target}`);
}
