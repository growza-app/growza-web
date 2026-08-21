import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { CustomersClient } from './CustomersClient';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  let stats, first, me;
  try {
    [stats, first, me] = await Promise.all([api.customerStats(), api.customers({ limit: 20, offset: 0 }), api.me()]);
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
  return <CustomersClient initialStats={stats} initialPage={first} label={me.labels.customers ?? 'Customers'} />;
}
