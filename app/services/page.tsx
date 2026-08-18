import { api, formatMoney } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const [me, services] = await Promise.all([api.me(), api.services()]);

  return (
    <>
      <PageHeader title={me.labels.services ?? copy.nav.services} subtitle={copy.services.subtitle} />
      <div className="page-body">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{copy.services.name}</th>
                <th>{copy.services.type}</th>
                <th>{copy.services.takes}</th>
                <th>{copy.services.cleanupTime}</th>
                <th>{copy.services.price}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 620 }}>{s.name}</td>
                  <td className="muted">{s.categoryName ?? '—'}</td>
                  <td>{copy.services.minutes(s.durationMin)}</td>
                  {/* "Cleanup time" instead of "buffer" — same data, words an owner uses. */}
                  <td className="muted">
                    {s.bufferAfterMin > 0 ? copy.services.minutes(s.bufferAfterMin) : copy.services.noCleanup}
                  </td>
                  <td>{formatMoney(s.priceMinor, s.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
