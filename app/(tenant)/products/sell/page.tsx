import { screenTitle } from '../../lib/page-title';
import { SellProductScreen, type SellSearch } from './SellProductScreen';

export const dynamic = 'force-dynamic';

/**
 * Dedicated counter sale / retail POS screen for products (`/products/sell`).
 *
 * The screen itself is `SellProductScreen`, shared with a shop's `/orders/new` (Jira GRW-616); this address is guarded under
 * its own name, so a role not offered the shelf's till lands where it always did.
 */
export default function SellProductPage({ searchParams }: { searchParams: Promise<SellSearch> }) {
  return <SellProductScreen searchParams={searchParams} guard="/products/sell" />;
}

export const metadata = screenTitle('Sell product');
