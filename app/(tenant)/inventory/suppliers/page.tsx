import { guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';
import { InventoryScreen } from '../InventoryScreen';
import { SuppliersPanel } from '../SuppliersPanel';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Inventory · Suppliers');

/**
 * Jira GRW-741 FR-04 — Inventory › Suppliers: who the branch buys from, and what each has sold it. The owner's and a manager's (Change on the
 * menu). Jira GRW-744 — not a tab any more: reached from Stock's foot (and Stock in), and drawn under the Stock tab with a way back.
 */
export default async function InventorySuppliersPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await guardScreen('/inventory/suppliers');
  const params = await searchParams;
  return (
    <InventoryScreen tab="stock" wanted={params.branch ?? null}>
      {(branchId) => <SuppliersPanel key={branchId} branchId={branchId!} backHref={`/inventory?branch=${encodeURIComponent(branchId!)}`} />}
    </InventoryScreen>
  );
}
