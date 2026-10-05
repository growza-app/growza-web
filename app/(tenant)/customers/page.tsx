import { labelledTitle, TITLE_FALLBACK } from '../lib/page-title';
import { api, type CustomerSort, type CustomerStatusFilter, type SortDirection } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { CustomersClient } from './CustomersClient';
import { getLocale, getTranslations } from 'next-intl/server';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { pickNoun } from '../lib/nouns';
import { loadAtBranch } from '../lib/branch-load';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { guardScreen } from '../lib/screen-guard';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; dir?: string; branch?: string }>;
}) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/customers');
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

  const nouns = await getTranslations('nouns');
  const locale = await getLocale();

  let stats, first, me, branch;
  try {
    // Jira GRW-392 — each branch keeps its own clients: the branch in the address, the shared one BranchUrlSync puts
    // there, or every branch (null) for an owner on "All". A receptionist's is always their own. Jira GRW-397 —
    // loaded alongside `/me`, not after it.
    const loaded = await loadAtBranch(params.branch, api.me(), (location) =>
      Promise.all([api.customerStats(location), api.customers({ status, sort, direction, limit: 20, offset: 0, location })]),
    );
    me = loaded.me!;
    branch = loaded.branch!;
    [stats, first] = loaded.data;
  } catch (error) {
    return (
      <>
        <PageHeader title={nouns('customersTitle')} menu />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  // "Clients" for a salon, "Patients" for a clinic — the noun is vertical
  // config, never hardcoded (CLAUDE.md: every dashboard-visible noun comes
  // from ctx.labels).
  return (
    <>
      <BranchUrlSync />
      <CustomersClient
      key={branch.choice ?? 'all'}
      branchId={branch.choice}
      branches={branch.multi && !branch.pinned ? branch.branches : []}
      initialStats={stats}
      initialPage={first}
      initialStatus={status}
      initialSort={sort}
      initialDirection={direction}
      label={pickNoun(locale, me.labels.customers ?? 'Customers', nouns('customersTitle'))}
      />
    </>
  );
}

/**
 * Jira GRW-192 — the vertical names this screen, not us. A clinic reads
 * "Doctors" / "Patients" / "Visits" here; a garage "Mechanics" / "Jobs".
 */
export const generateMetadata = () => labelledTitle('customers', TITLE_FALLBACK.customers);
