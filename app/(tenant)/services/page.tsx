import { labelledTitle, TITLE_FALLBACK } from '../lib/page-title';
import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { ServicesTable } from './ServicesTable';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  // allServices (not services) so retired rows are visible and restorable here;
  // the booking flows keep using the active-only list.
  const [me, services, categories] = await Promise.all([api.me(), api.allServices(), api.serviceCategories()]);

  return (
    <>
      {/* GRW-30 — the header and the `table-fit` body are ServicesTable's own,
          because "Add service" lives in the header's action slot and the state
          behind it lives in the table. `table-fit`: desktop pins the toolbar,
          tabs and pagination and lets only the rows scroll, so the pager is
          never below the fold. Shared with Clients — see 32-customers.css. */}
      <ServicesTable
        services={services}
        categories={categories}
        tenantName={me.tenant?.name ?? null}
        serviceLabel={me.labels.services ?? copy.nav.services}
      />
    </>
  );
}

/**
 * Jira GRW-192 — the vertical names this screen, not us. A clinic reads
 * "Doctors" / "Patients" / "Visits" here; a garage "Mechanics" / "Jobs".
 */
export const generateMetadata = () => labelledTitle('services', TITLE_FALLBACK.services);
