import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { ServicesTable } from './ServicesTable';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const [me, services] = await Promise.all([api.me(), api.services()]);

  return (
    <>
      <PageHeader title={me.labels.services ?? copy.nav.services} subtitle={copy.services.subtitle} />
      <div className="page-body">
        <ServicesTable services={services} />
      </div>
    </>
  );
}
