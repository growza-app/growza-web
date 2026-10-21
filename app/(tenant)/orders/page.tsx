import { screenTitle } from '../lib/page-title';
import { SalesScreen, type SalesSearch } from '../sales/SalesScreen';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-608 — a shop's Orders: its own route, over the same data layer as the salon's register.
 *
 * What an Orders screen holds (states, channels, a buyer who is not a client) is Jira GRW-587's; until then a shop's
 * orders are what the register already lists — every bill, row by row — and this is that register under its own
 * address. The route is the code-splitting boundary: a salon's pages never import this file, and the nav policy
 * (`areas.ts`) offers it to a shop alone and sends anyone else Home.
 */
export default function OrdersPage({ searchParams }: { searchParams: Promise<SalesSearch> }) {
  return <SalesScreen searchParams={searchParams} guard="/orders" />;
}

export const metadata = screenTitle('Orders');
