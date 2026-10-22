import { getTranslations } from 'next-intl/server';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { homeCopy } from '../lib/home-copy';
import { serverLang } from '../lib/lang';
import { ORDERS_PAGE_SIZE, readQuery } from '../lib/orders-filter';
import { mayUse } from '../lib/nav-policy';
import { isWritable } from '../lib/read-only';
import { OrdersClient } from './OrdersClient';
import { OrdersBringIn } from './OrdersBringIn';

/**
 * Jira GRW-614 — a shop's Orders: every order, newest first, filtered by where it came from and what state it is in.
 *
 * Its own route over the order spine, not the Sales register under another name (which is what `/orders` was until this
 * story): that register is built from bookings and fetches a window of days to sum on the client; this is a server-paged
 * list that never holds more than a page, because a shop's season is tens of thousands of rows.
 *
 * The first page is read here, from the address, so a filtered link (Home's counts, a bookmark) opens already filtered
 * and nothing flashes unfiltered first. Everything after that — a chip, the search, the next page — is the client asking
 * the server again. A failed first read is not a failed screen: the client shows the retry with the filters as they were.
 */
export type OrdersSearch = { channel?: string; status?: string; q?: string; page?: string };

export async function OrdersScreen({ searchParams }: { searchParams: Promise<OrdersSearch> }) {
  const query = readQuery(await searchParams);

  let me: Awaited<ReturnType<typeof api.me>> | null = null;
  try {
    me = await api.me();
  } catch {
    me = null;
  }
  const lang = await serverLang();
  const copy = homeCopy(lang, me?.labels ?? {});
  const heading = copy.nav.orders;
  // Jira GRW-616 — taking an order is the list's one create action, for whoever stands at the till and may record a sale.
  const mayTake = me ? mayUse(me.member?.role, 'visit.recordPayment', isWritable(me.tenant?.status)) : false;
  // Jira GRW-619 — importing a marketplace's order report is the owner's and the manager's, as the API is (the desk packs the parcels).
  const role = me?.member?.role;
  // Jira GRW-635 — what came back and why is the owner's and the manager's to read, as the API is; reading it needs no write.
  const mayReadReturns = me ? role === undefined || role === 'owner' || role === 'manager' : false;
  const tOrders = await getTranslations('orders');
  const mayImport = me ? (role === undefined || role === 'owner' || role === 'manager') && isWritable(me.tenant?.status) : false;

  // The whole business on arrival; a branch the header picker has chosen is applied by the client, which re-reads.
  const initial = await api.orders({ channel: query.channel, status: query.status, q: query.q.trim(), page: query.page, pageSize: ORDERS_PAGE_SIZE }).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  }));

  // Jira GRW-623 — whether orders are coming in by themselves: the owner's and manager's to read, as the API is. A failed read says nothing
  // rather than failing the screen: the list is what the page is for.
  const bringIn = mayReadReturns ? await api.channelOrdersStatus().then((r) => r.channels).catch(() => []) : [];

  return (
    <>
      <PageHeader
        title={heading}
        actions={
          mayTake || mayImport || mayReadReturns ? (
            <>
              {mayReadReturns ? (
                <a className="btn btn-ghost" href="/orders/returns">
                  {tOrders('returnsLink')}
                </a>
              ) : null}
              {mayImport ? (
                <a className="btn btn-ghost" href="/orders/import">
                  {copy.shop.importOrders}
                </a>
              ) : null}
              {mayTake ? (
                <a className="btn btn-primary" href="/orders/new">
                  {copy.shop.takeOrder}
                </a>
              ) : null}
            </>
          ) : undefined
        }
      />
      <div className="page-body ord-page">
        <OrdersBringIn lines={bringIn} lang={lang} timezone={me?.tenant?.timezone ?? 'Asia/Kolkata'} />
        <OrdersClient initialQuery={query} initial={'rows' in initial ? initial : null} timezone={me?.tenant?.timezone ?? 'Asia/Kolkata'} />
      </div>
    </>
  );
}
