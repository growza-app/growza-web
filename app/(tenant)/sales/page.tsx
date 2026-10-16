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

  let appointments: Appointment[] = [];
  let loadFailed = false;
  try {
    appointments = await api.appointments(thirtyDaysAgoISO, todayISO);
  } catch {
    loadFailed = true;
  }

  const initialRange: SalesRange =
    params.range === 'today' || params.range === 'last_7_days' || params.range === 'last_30_days'
      ? params.range
      : initialFilter === 'products'
        ? 'last_30_days'
        : 'today';

  return (
    <SalesClient
      appointments={appointments}
      timezone={timezone}
      todayISO={todayISO}
      initialFilter={initialFilter}
      initialRange={initialRange}
      initialQuery={params.q ?? ''}
      loadFailed={loadFailed}
    />
  );
}

export const metadata = screenTitle('Sales');
