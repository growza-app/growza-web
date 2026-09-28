import { labelledTitle, TITLE_FALLBACK } from '../lib/page-title';
import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { resolveBranchState } from '../lib/branch-context';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { ServicesTable } from './ServicesTable';

export const dynamic = 'force-dynamic';

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const params = await searchParams;
  const me = await api.me();

  // Jira GRW-378 — each branch has its own services, so this screen always shows exactly ONE branch: the one in
  // the address, else the main branch. BranchUrlSync puts the dashboard's shared branch into the address on
  // arrival, and makes a tab picked here the shared branch for every other screen.
  const branch = resolveBranchState({
    branches: me.branches ?? [],
    role: me.member?.role ?? null,
    memberLocationId: me.member?.locationId ?? null,
    wanted: params.branch ?? null,
  });
  const branchId = branch.one;

  // allServices (not services) so retired rows are visible and restorable here;
  // the booking flows keep using the active-only list.
  const [services, categories] = branchId ? await Promise.all([api.allServices(branchId), api.serviceCategories(branchId)]) : [[], []];

  return (
    <>
      <BranchUrlSync />
      {/* GRW-30 — the header and the `table-fit` body are ServicesTable's own,
          because "Add service" lives in the header's action slot and the state
          behind it lives in the table. `table-fit`: desktop pins the toolbar,
          tabs and pagination and lets only the rows scroll, so the pager is
          never below the fold. Shared with Clients — see 32-customers.css.
          Keyed by branch: a different branch is a different list, not an edit of this one. */}
      {branchId && (
        <ServicesTable
          key={branchId}
          services={services}
          categories={categories}
          tenantName={me.tenant?.name ?? null}
          serviceLabel={me.labels.services ?? copy.nav.services}
          branchId={branchId}
          branches={branch.multi && !branch.pinned ? branch.branches : []}
        />
      )}
    </>
  );
}

/**
 * Jira GRW-192 — the vertical names this screen, not us. A clinic reads
 * "Doctors" / "Patients" / "Visits" here; a garage "Mechanics" / "Jobs".
 */
export const generateMetadata = () => labelledTitle('services', TITLE_FALLBACK.services);
