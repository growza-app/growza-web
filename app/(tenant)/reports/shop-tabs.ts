/**
 * Owner, 2026-11-28 — a retail shop's Reports tabs, in order (ShopReports.tsx). A plain module, not the client component's:
 * the server page reads this list to pick the tab a link asked for (`?view=`), as restaurant-tabs.ts does.
 */
export type ShopTab = 'overview' | 'sales' | 'customers' | 'products' | 'stock' | 'returns';
export const SHOP_TABS: readonly ShopTab[] = ['overview', 'sales', 'customers', 'products', 'stock', 'returns'];
