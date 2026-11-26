/**
 * The salon's Reports tabs, in order — the restaurant's layout (restaurant-tabs.ts) with a diary's questions. A plain module,
 * not the client component's: the server page reads this list to pick the tab a link asked for.
 */
export type SalonTab = 'overview' | 'sales' | 'services' | 'team' | 'chairs' | 'clients' | 'loyalty' | 'tips';
export const SALON_TABS: readonly SalonTab[] = ['overview', 'sales', 'services', 'team', 'chairs', 'clients', 'loyalty', 'tips'];
/** Tabs that read fixed windows of their own, not the date picker. */
export const FIXED_WINDOW_TABS: readonly SalonTab[] = ['loyalty', 'tips'];
