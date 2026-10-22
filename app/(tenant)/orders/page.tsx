import { screenTitle } from '../lib/page-title';
import { guardScreen } from '../lib/screen-guard';
import { OrdersScreen, type OrdersSearch } from './OrdersScreen';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-614 — a shop's Orders. Its own screen over the order spine (Jira GRW-612), server-paged, filtered and searched;
 * it replaces the Sales register this address showed from Jira GRW-608 until the real list existed.
 */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<OrdersSearch> }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on a list that answers 403.
  await guardScreen('/orders');
  return <OrdersScreen searchParams={searchParams} />;
}

export const metadata = screenTitle('Orders');
