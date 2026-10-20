import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { homeCopy } from '../lib/home-copy';
import { serverLang } from '../lib/lang';
import { ORDERS_PAGE_SIZE, readQuery } from '../lib/orders-filter';
import { OrdersClient } from './OrdersClient';

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
  const heading = homeCopy(lang, me?.labels ?? {}).nav.orders;

  // The whole business on arrival; a branch the header picker has chosen is applied by the client, which re-reads.
  const initial = await api.orders({ channel: query.channel, status: query.status, q: query.q.trim(), page: query.page, pageSize: ORDERS_PAGE_SIZE }).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  }));

  return (
    <>
      <PageHeader title={heading} />
      <div className="page-body ord-page">
        <OrdersClient
          initialQuery={query}
          initial={'rows' in initial ? initial : null}
          timezone={me?.tenant?.timezone ?? 'Asia/Kolkata'}
        />
      </div>
    </>
  );
}
