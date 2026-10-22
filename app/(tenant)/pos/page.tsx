import { redirect } from 'next/navigation';
import { guardLive, guardScreen } from '../lib/screen-guard';
import { screenTitle } from '../lib/page-title';
import { api } from '../lib/api';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { mayUse } from '../lib/nav-policy';
import { isWritable } from '../lib/read-only';
import { DEFAULT_PRODUCT_RETURN_WINDOW_DAYS } from '../sales/sales-helpers';
import { PosClient } from './PosClient';
import { mayTakeReturns, posModeOf } from './pos-helpers';

export const dynamic = 'force-dynamic';

/**
 * The POS tab (`/pos`): sell products, print the GST receipt, and take a product back onto the shelf, from one screen
 * that sits in the left menu.
 *
 * It asks what the till (`/products/sell`, which now lands here) always asked: the same `visit.recordPayment`
 * permission and the same go-live gate. Return is drawn only for the people the API lets refund (`mayTakeReturns`).
 */
export default async function PosPage({ searchParams }: { searchParams: Promise<{ mode?: string; from?: string }> }) {
  await guardScreen('/pos');
  await guardLive('/pos');
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
    redirect('/');
  }

  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const canReturn = mayTakeReturns(me.member?.role, me.reportTabs);

  return (
    <div className="page-body pos-page">
      <PosClient
        timezone={timezone}
        todayISO={todayISO}
        returnWindowDays={me.tenant?.productReturnWindowDays ?? DEFAULT_PRODUCT_RETURN_WINDOW_DAYS}
        canReturn={canReturn}
        initialMode={posModeOf(params.mode, canReturn)}
        backTo={params.from === 'products' ? '/products' : params.from === 'sales' ? '/sales' : undefined}
      />
    </div>
  );
}

export const metadata = screenTitle('POS');
