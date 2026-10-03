import { labelledTitle, TITLE_FALLBACK } from '../lib/page-title';
import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { resolveBranchState } from '../lib/branch-context';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { ServicesTable } from './ServicesTable';
import { guardScreen } from '../lib/screen-guard';
import { loadErrorKind } from '../lib/load-error';
import { LoadErrorBanner } from '../components/LoadErrorBanner';

export const dynamic = 'force-dynamic';

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/services');
  const params = await searchParams;
  /*
   * Jira GRW-478 (U-2) — a busy or unreachable server is the shared banner, as on every other screen. These reads
   * had no catch, so a 429 or a 500 replaced the whole screen with a crash page.
   */
  let me: Awaited<ReturnType<typeof api.me>>;
  try {
    me = await api.me();
  } catch (error) {
    return (
      <div className="page-body">
        <LoadErrorBanner kind={loadErrorKind(error)} />
      </div>
    );
  }

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
  let services: Awaited<ReturnType<typeof api.allServices>> = [];
  let categories: Awaited<ReturnType<typeof api.serviceCategories>> = [];
  try {
    if (branchId) [services, categories] = await Promise.all([api.allServices(branchId), api.serviceCategories(branchId)]);
  } catch (error) {
    return (
      <div className="page-body">
        <LoadErrorBanner kind={loadErrorKind(error)} />
      </div>
    );
  }

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
