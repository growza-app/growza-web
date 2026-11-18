import { redirect } from 'next/navigation';
import { guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Inventory');

/**
 * Jira GRW-741 FR-07 — Kitchen stock was the Menu's second tab at this address; it is Inventory now, its own section. A bookmark, a link in
 * an old message or a habit lands on the same thing at its new address: `?show=to-buy` on Buy, `?show=no-recipe` on Recipes, the branch kept.
 * The Inventory screen guards itself as well.
 */
export default async function KitchenStockMoved({ searchParams }: { searchParams: Promise<{ branch?: string; show?: string }> }) {
  const params = await searchParams;
  const tab = params.show === 'to-buy' ? '/inventory/buy' : params.show === 'no-recipe' ? '/inventory/recipes' : '/inventory';
  // Asked by the NEW address (a cook's old bookmark still reaches Stock), so whoever may not open it is sent Home from here as well.
  await guardScreen(tab);
  redirect(params.branch ? `${tab}?branch=${encodeURIComponent(params.branch)}` : tab);
}
