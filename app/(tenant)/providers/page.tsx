import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { StaffClient } from './StaffClient';

export const dynamic = 'force-dynamic';

export default async function ProvidersPage() {
  let me, overview, services;
  try {
    [me, overview, services] = await Promise.all([api.me(), api.providersOverview(), api.services()]);
  } catch {
    return (
      <>
        <PageHeader title={copy.nav.staff} />
        <div className="page-body">
          <div className="banner">
            <strong>{copy.errors.apiDown}</strong> {copy.errors.apiDownHelp} <code>npm run dev</code>.
          </div>
        </div>
      </>
    );
  }

  const staffWord = me.labels.providers ?? copy.nav.staff;

  return (
    <>
      {/* The seats/working counts moved into the roster's own summary line
          (StaffClient) so they sit with the filters they describe, rather than
          repeating in the page subtitle. */}
      <PageHeader title={staffWord} />
      <div className="page-body">
        <StaffClient
          initialOverview={overview}
          services={services}
          staffWord={staffWord}
          maxProviders={me.capabilities.maxProviders}
        />
      </div>
    </>
  );
}
