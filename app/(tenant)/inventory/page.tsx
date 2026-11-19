import { guardScreen } from '../lib/screen-guard';
import { screenTitle } from '../lib/page-title';
import { InventoryScreen } from './InventoryScreen';
import { KitchenStockClient } from './KitchenStockClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Inventory');

/**
 * Jira GRW-741 — Inventory › Stock (was Kitchen stock, the Menu's second tab — Jira GRW-737): what the kitchen cooks with and how much of
 * each is left, one branch at a time. The owner, a manager, the counter and the cook open it; only the owner and a manager change it, the
 * kitchen records wastage and counts, and the API leaves every price out for whoever cannot see the money.
 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ branch?: string; show?: string; item?: string }> }) {
  await guardScreen('/inventory');
  const params = await searchParams;
  return (
    <InventoryScreen tab="stock" wanted={params.branch ?? null}>
      {/* Jira GRW-744 — `?show=to-buy` opens on To buy (what the Buy tab was; an old bookmark lands there). */}
      {/* QA 2026-11-19 — `?item=` opens that item (Reports links each item with no price straight to it). */}
      {(branchId) => (
        <KitchenStockClient key={branchId} branchId={branchId!} initialFilter={params.show === 'to-buy' ? 'buy' : 'all'} initialItem={params.item ?? null} />
      )}
    </InventoryScreen>
  );
}
