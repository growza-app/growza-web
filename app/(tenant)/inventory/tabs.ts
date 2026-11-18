/**
 * Jira GRW-741 — Inventory's five tabs and their addresses, in order. One list, read by the tab bar and by the tests that check each tab is
 * a screen with its own guard. Who sees which is `canSee`'s answer for the address (`lib/nav-policy.ts`), never a list here.
 */
export const INVENTORY_TABS = [
  { key: 'stock', href: '/inventory' },
  { key: 'buy', href: '/inventory/buy' },
  { key: 'suppliers', href: '/inventory/suppliers' },
  { key: 'recipes', href: '/inventory/recipes' },
  { key: 'reports', href: '/inventory/reports' },
] as const;

export type InventoryTab = (typeof INVENTORY_TABS)[number]['key'];
