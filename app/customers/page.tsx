import { api, type CustomerSort, type CustomerStatusFilter } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { CustomersClient } from './CustomersClient';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  const params = await searchParams;
  // Deep-linked from Home's "Needs attention" card (?status=lapsed&sort=spent)
  // — validated against the real union rather than cast, so a stray/typo'd
  // query param falls back to the normal defaults instead of ever reaching
  // the API with a bad value.
  const status: CustomerStatusFilter =
    params.status === 'active' || params.status === 'inactive' || params.status === 'lapsed' ? params.status : 'all';
  const sort: CustomerSort = params.sort === 'spent' ? 'spent' : 'recent';

  let stats, first, me;
  try {
    [stats, first, me] = await Promise.all([
      api.customerStats(),
      api.customers({ status, sort, limit: 20, offset: 0 }),
      api.me(),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Customers" />
        <div className="page-body">
          <div className="banner">
            <strong>Cannot reach the server.</strong> Ask your developer to start it, or run <code>npm run dev</code>.
          </div>
        </div>
      </>
    );
  }

  // "Clients" for a salon, "Patients" for a clinic — the noun is vertical
  // config, never hardcoded (CLAUDE.md: every dashboard-visible noun comes
  // from ctx.labels).
  return (
    <CustomersClient
      initialStats={stats}
      initialPage={first}
      initialStatus={status}
      initialSort={sort}
      label={me.labels.customers ?? 'Customers'}
    />
  );
}
