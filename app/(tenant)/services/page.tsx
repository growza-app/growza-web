import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { ServicesTable } from './ServicesTable';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  // allServices (not services) so retired rows are visible and restorable here;
  // the booking flows keep using the active-only list.
  const [me, services, categories] = await Promise.all([api.me(), api.allServices(), api.serviceCategories()]);

  return (
    <>
      <PageHeader title={me.labels.services ?? copy.nav.services} subtitle={copy.services.subtitle} />
      {/* svc-fit: desktop pins the toolbar, tabs and pagination and lets only
          the rows scroll, so the pager is never below the fold. */}
      <div className="page-body svc-fit">
        <ServicesTable
          services={services}
          categories={categories}
          tenantName={me.tenant?.name ?? null}
          serviceLabel={me.labels.services ?? copy.nav.services}
        />
      </div>
    </>
  );
}
