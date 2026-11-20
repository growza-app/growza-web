/**
 * Jira GRW-741 · GRW-744 — Inventory's tabs and their addresses, in order: Stock · Recipes · Reports. One list, read by the tab bar and by
 * the tests that check each tab is a screen with its own guard. Who sees which is `canSee`'s answer for the address (`lib/nav-policy.ts`).
 *
 * GRW-744 — there were five. Buy is Stock's "To buy" filter now (`/inventory/buy` sends there), and Suppliers is reached from Stock and from
 * Stock in (`/inventory/suppliers` still answers, drawn under Stock); five did not fit a 344px phone and asked an owner to learn the screen.
 */
export const INVENTORY_TABS = [
  { key: 'stock', href: '/inventory' },
  { key: 'reports', href: '/inventory/reports' },
] as const;

export type InventoryTab = (typeof INVENTORY_TABS)[number]['key'];
