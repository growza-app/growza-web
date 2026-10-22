import { redirect } from 'next/navigation';
import { guardLive, guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';

export const dynamic = 'force-dynamic';

/**
 * `/products/sell` was the till before the POS tab existed. The Products screen, the Sales register, Home's quick
 * action and a few bookmarks still point here, so the address keeps working and lands on the POS tab — with the
 * `from` it was given, so the back button still goes where it did.
 *
 * It still asks the questions it always asked before it sends anyone anywhere: someone the till is closed to, or a
 * business that is not live yet, is told so from the address they typed, not from wherever it forwards to.
 */
export default async function SellProductPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await guardScreen('/products/sell');
  await guardLive('/products/sell');
  const params = await searchParams;
  redirect(params.from === 'products' || params.from === 'sales' ? `/pos?from=${params.from}` : '/pos');
}

export const metadata = screenTitle('Sell product');
