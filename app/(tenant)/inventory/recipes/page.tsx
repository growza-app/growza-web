import { guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';
import { InventoryScreen } from '../InventoryScreen';
import { RecipesClient } from '../RecipesClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Inventory · Recipes');

/** Jira GRW-741 FR-05 — Inventory › Recipes: every dish with its cost and food cost, the ones with no recipe first (`RecipesClient`). */
export default async function InventoryRecipesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await guardScreen('/inventory/recipes');
  const params = await searchParams;
  return (
    <InventoryScreen tab="recipes" wanted={params.branch ?? null}>
      {(branchId) => <RecipesClient key={branchId} branchId={branchId!} />}
    </InventoryScreen>
  );
}
