import { redirect } from 'next/navigation';
import { guardLive, guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { mayUse } from '../../lib/nav-policy';
import { isWritable } from '../../lib/read-only';
import { SellProductClient } from './SellProductClient';

export const dynamic = 'force-dynamic';

/**
 * Dedicated counter sale / retail POS screen (`/products/sell`).
 *
 * Uses the same `visit.recordPayment` write permission and go-live gate as the Till,
 * and `guardScreen('/products')` for `/products` segment access.
 */
export default async function SellProductPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  await guardScreen('/products');
  await guardLive('/appointments/new');
  const params = await searchParams;

  let me;
  try {
    me = await api.me();
  } catch (error) {
    return (
      <div className="page-body">
        <LoadErrorBanner kind={loadErrorKind(error)} />
      </div>
    );
  }

  if (!mayUse(me.member?.role, 'visit.recordPayment', isWritable(me.tenant?.status))) {
    redirect('/products');
  }

  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';

  return <SellProductClient timezone={timezone} backTo={params.from === 'products' ? '/products' : undefined} />;
}

export const metadata = screenTitle('Sell product');
