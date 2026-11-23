import { redirect } from 'next/navigation';
import { guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Menu');

/**
 * Owner, 2026-11-20 — Inventory's Recipes tab is gone: a dish's recipe is looked after on the Menu, beside the dish
 * (its Recipe button, and the Menu's "Needs a recipe" tab). An old link or bookmark lands on that tab.
 */
export default async function InventoryRecipesMoved({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Asked by the NEW address, so whoever may not open the Menu is sent Home from here as well.
  await guardScreen('/stock');
  const params = await searchParams;
  redirect(params.branch ? `/stock?show=noRecipe&branch=${encodeURIComponent(params.branch)}` : '/stock?show=noRecipe');
}
