import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../lib/page-title';
import { api, type Appointment } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { guardScreen } from '../lib/screen-guard';
import { SalesClient, type SalesFilter, type SalesRange } from './SalesClient';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-581 (Epic GRW-573) — the Sales register.
 *
 * Every completed bill row-by-row: what services were performed, what products
 * were sold over the counter, which client paid, who served them, how they paid,
 * and the total amount.
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    range?: string;
    date?: string;
    to?: string;
    q?: string;
  }>;
}) {
  await guardScreen('/sales');
  const t = await getTranslations('sales');
  const params = await searchParams;

  let me: Awaited<ReturnType<typeof api.me>>;
  try {
    me = await api.me();
  } catch (error) {
    return (
      <>
        <PageHeader title={t('title')} menu />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';
  const now = new Date();
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  const thirtyDaysAgoISO = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
    new Date(now.getTime() - 29 * 86_400_000),
  );

  const initialFilter: SalesFilter =
    params.filter === 'products' ? 'products' : params.filter === 'services' ? 'services' : 'all';

  const initialRange: SalesRange =
    params.range === 'today' || params.range === 'last_7_days' || params.range === 'last_30_days'
      ? params.range
      : initialFilter === 'products'
        ? 'last_30_days'
        : 'today';

  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const defaultFrom = initialRange === 'last_30_days' ? thirtyDaysAgoISO : todayISO;
  const initialFrom = params.date && isoRe.test(params.date) ? params.date : defaultFrom;
  const initialTo =
    params.to && isoRe.test(params.to) && params.to >= initialFrom
      ? params.to
      : params.date && isoRe.test(params.date)
        ? params.date
        : todayISO;

  const fetchFrom = initialFrom < thirtyDaysAgoISO ? initialFrom : thirtyDaysAgoISO;
  const fetchTo = initialTo > todayISO ? initialTo : todayISO;

  let appointments: Appointment[] = [];
  let loadFailed = false;
  try {
    appointments = await api.appointments(fetchFrom, fetchTo, undefined, undefined, { includeSales: true });
  } catch {
    loadFailed = true;
  }

  return (
    <SalesClient
      appointments={appointments}
      timezone={timezone}
      todayISO={todayISO}
      initialFrom={initialFrom}
      initialTo={initialTo}
      initialFilter={initialFilter}
      initialRange={initialRange}
      initialQuery={params.q ?? ''}
      loadFailed={loadFailed}
    />
  );
}

export const metadata = screenTitle('Sales');
