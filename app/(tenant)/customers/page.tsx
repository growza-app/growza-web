import { labelledTitle, TITLE_FALLBACK } from '../lib/page-title';
import { api, type CustomerSort, type CustomerStatusFilter, type SortDirection } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { CustomersClient } from './CustomersClient';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  // Deep-linked from Home's "Needs attention" card (?status=at_risk&sort=spent)
  // and from every Reports segment card — validated against the real union
  // rather than cast, so a stray/typo'd query param falls back to the normal
  // defaults instead of ever reaching the API with a bad value.
  // `lapsed` is still honoured: it was the one wide band that Due a visit and
  // Slipping away replaced, so an older bookmark keeps working. Nothing links
  // to it any more — Home used to, under the narrower band's name, which is
  // how it came to show 730 where the Clients page showed 462.
  const STATUSES = new Set(['active', 'due', 'at_risk', 'inactive', 'lapsed', 'never']);
  const SORTS = new Set(['recent', 'spent', 'visits', 'name']);
  const status: CustomerStatusFilter =
    params.status && STATUSES.has(params.status) ? (params.status as CustomerStatusFilter) : 'all';
  const sort: CustomerSort = params.sort && SORTS.has(params.sort) ? (params.sort as CustomerSort) : 'recent';
  // `dir` travels with `sort` or not at all. A link carrying the column but
  // not the order would restore a different list than the one the sender was
  // looking at — sorting by name would come back descending.
  const direction: SortDirection = params.dir === 'asc' ? 'asc' : 'desc';

  let stats, first, me;
  try {
    [stats, first, me] = await Promise.all([
      api.customerStats(),
      api.customers({ status, sort, direction, limit: 20, offset: 0 }),
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
      initialDirection={direction}
      label={me.labels.customers ?? 'Customers'}
    />
  );
}

/**
 * Jira GRW-192 — the vertical names this screen, not us. A clinic reads
 * "Doctors" / "Patients" / "Visits" here; a garage "Mechanics" / "Jobs".
 */
export const generateMetadata = () => labelledTitle('customers', TITLE_FALLBACK.customers);
