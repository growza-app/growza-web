import { redirect } from 'next/navigation';
import { guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Inventory');

/**
 * Jira GRW-744 FR-06 — Buy is Stock's "To buy" filter now. This address (GRW-741's Buy tab, and where the kitchen's old `?show=to-buy` went)
 * lands there, the branch kept, for whoever may open Stock.
 */
export default async function InventoryBuyMoved({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await guardScreen('/inventory');
  const params = await searchParams;
  redirect(`/inventory?show=to-buy${params.branch ? `&branch=${encodeURIComponent(params.branch)}` : ''}`);
}
