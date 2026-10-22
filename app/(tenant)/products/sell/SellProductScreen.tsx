import { redirect } from 'next/navigation';
import { guardLive, guardScreen } from '../../lib/screen-guard';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { mayUse } from '../../lib/nav-policy';
import { isWritable } from '../../lib/read-only';
import { homeCopy } from '../../lib/home-copy';
import { serverLang } from '../../lib/lang';
import { SellProductClient } from './SellProductClient';

/**
 * The counter sale / retail till, guarded under whichever address it is reached by (Jira GRW-616): `/products/sell` for a
 * business that sells beside its services, `/orders/new` for a shop, whose counter takes an ORDER. One implementation, two
 * addresses — the same arrangement the shelf (`/products` · `/stock`) and the register (`/sales`) already have — so
 * nothing about the till is copied and no screen asks what kind of business this is: the nav policy answers who may open
 * which address.
 *
 * Uses the same `visit.recordPayment` write permission and go-live gate as the Till.
 */
export type SellSearch = { from?: string };

export async function SellProductScreen({ searchParams, guard }: { searchParams: Promise<SellSearch>; guard: '/products/sell' | '/orders/new' }) {
  // The till sells from the shelf; the Products catalogue is a different screen with a different answer per role.
  await guardScreen(guard);
  await guardLive(guard);
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
    redirect(guard === '/orders/new' ? '/orders' : '/products');
  }

  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';
  const forShop = guard === '/orders/new';
  // A shop's till says what a shop says, from the vertical's own words; every other address keeps "Sell product".
  const heading = forShop ? homeCopy(await serverLang(), me.labels).shop.takeOrder : undefined;
  const backTo = forShop ? '/orders' : params.from === 'products' ? '/products' : params.from === 'sales' ? '/sales' : undefined;

  return (
    <div className="page-body">
      <SellProductClient timezone={timezone} backTo={backTo} heading={heading} />
    </div>
  );
}
