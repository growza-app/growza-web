import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { PaginatedTable } from '../components/PaginatedTable';

export const dynamic = 'force-dynamic';

export default async function ProvidersPage() {
  const [me, providers] = await Promise.all([api.me(), api.providers()]);

  return (
    <>
      <PageHeader
        title={me.labels.providers ?? copy.nav.staff}
        subtitle={copy.staff.subtitle(providers.length, me.capabilities.maxProviders)}
      />
      <div className="page-body">
        <div className="card">
          <PaginatedTable
            noun={(me.labels.providers ?? copy.nav.staff).toLowerCase()}
            head={
              <tr>
                <th>{copy.staff.name}</th>
                <th>{copy.staff.role}</th>
              </tr>
            }
          >
            {providers.map((p) => (
              <tr key={p.id} data-row>
                <td style={{ fontWeight: 620 }}>{p.displayName}</td>
                <td className="muted">{p.title ?? '—'}</td>
              </tr>
            ))}
          </PaginatedTable>
        </div>
      </div>
    </>
  );
}
