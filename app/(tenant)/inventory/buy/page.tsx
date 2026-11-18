import { guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';
import { InventoryScreen } from '../InventoryScreen';
import { BuyClient } from '../BuyClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Inventory · Buy');

/** Jira GRW-741 FR-03 — Inventory › Buy: what to buy, stock in and past stock ins (`BuyClient`). The cook reads the list too, with no prices. */
export default async function InventoryBuyPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await guardScreen('/inventory/buy');
  const params = await searchParams;
  return (
    <InventoryScreen tab="buy" wanted={params.branch ?? null}>
      {(branchId) => <BuyClient key={branchId} branchId={branchId!} />}
    </InventoryScreen>
  );
}
