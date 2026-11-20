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
  // Owner, 2026-11-20 — a dish's recipe is looked after on the Menu now; "no recipe" opens the Menu on its Needs a recipe tab.
  const tab = params.show === 'no-recipe' ? '/stock' : '/inventory';
  // Asked by the NEW address (a cook's old bookmark still reaches Stock), so whoever may not open it is sent Home from here as well.
  await guardScreen(tab);
  // Jira GRW-744 — To buy is a filter on Stock now, not its own address.
  const query = [params.show === 'to-buy' ? 'show=to-buy' : params.show === 'no-recipe' ? 'show=noRecipe' : null, params.branch ? `branch=${encodeURIComponent(params.branch)}` : null].filter(Boolean).join('&');
  redirect(query ? `${tab}?${query}` : tab);
}
