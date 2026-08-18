import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';

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
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{copy.staff.name}</th>
                  <th>{copy.staff.role}</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 620 }}>{p.displayName}</td>
                    <td className="muted">{p.title ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
