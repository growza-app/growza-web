import { labelledTitle, TITLE_FALLBACK } from '../lib/page-title';
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
          repeating in the page subtitle. GRW-30 — and the header itself is
          StaffClient's now, because "Add staff" sits in it and the state behind
          that button lives there. */}
      <StaffClient
        initialOverview={overview}
        services={services}
        staffWord={staffWord}
        maxProviders={me.capabilities.maxProviders}
      />
    </>
  );
}

/**
 * Jira GRW-192 — the vertical names this screen, not us. A clinic reads
 * "Doctors" / "Patients" / "Visits" here; a garage "Mechanics" / "Jobs".
 */
export const generateMetadata = () => labelledTitle('providers', TITLE_FALLBACK.providers);
