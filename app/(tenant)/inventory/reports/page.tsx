import { guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';
import { InventoryScreen } from '../InventoryScreen';
import { FoodCostReport } from '../../reports/money/FoodCostReport';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Inventory · Reports');

/**
 * Jira GRW-741 FR-06 — Inventory › Reports: food cost, what was used, and what was wasted or went missing, by date range (Jira GRW-739's
 * report, moved from Reports › Food cost, whose address now sends you here). Money, so the role's Reports page; it reads the header's branch
 * itself, "all branches" included.
 */
export default async function InventoryReportsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await guardScreen('/inventory/reports');
  const params = await searchParams;
  return (
    <InventoryScreen tab="reports" wanted={params.branch ?? null} oneBranch={false}>
      {() => <FoodCostReport />}
    </InventoryScreen>
  );
}
