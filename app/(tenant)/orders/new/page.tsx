import { screenTitle } from '../../lib/page-title';
import { SellProductScreen, type SellSearch } from '../../products/sell/SellProductScreen';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-616 — a shop's counter takes an order here: scan, size, pay, done.
 *
 * Not a second till. It is the till a shop already sells from (`/products/sell`) under the address and the words a shop
 * uses, exactly as `/stock` is the shelf under another address (Jira GRW-608) — so the scan, the size sheet, split pay and the
 * idempotency-keyed finish are the ones that have been in use, and the salon's till is untouched.
 */
export default function NewOrderPage({ searchParams }: { searchParams: Promise<SellSearch> }) {
  return <SellProductScreen searchParams={searchParams} guard="/orders/new" />;
}

export const metadata = screenTitle('New order');
