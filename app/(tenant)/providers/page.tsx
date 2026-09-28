import { labelledTitle, TITLE_FALLBACK } from '../lib/page-title';
import { api } from '../lib/api';
import { getTranslations } from 'next-intl/server';
import { copy } from '../lib/copy';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { PageHeader } from '../components/PageHeader';
import { StaffClient } from './StaffClient';
import { guardScreen } from '../lib/screen-guard';

export const dynamic = 'force-dynamic';

export default async function ProvidersPage() {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/providers');
  const tn = await getTranslations('nouns');
  let me, overview, services, settings, branches;
  try {
    [me, overview, services, settings, branches] = await Promise.all([
      api.me(),
      api.providersOverview(),
      api.services(),
      // GRW-22 — the salon's own week, so the wizard's Hours step opens on what
      // a new hire will actually work rather than on an empty seven days. Passed
      // RAW: `toWeekdayRows` lives in a 'use client' module, and calling it from
      // here is a 500 ("Attempted to call toWeekdayRows() from the server").
      // The seven-row shape is the client's business anyway — it is an editor
      // concern, not a transport one.
      api.settings(),
      // Jira GRW-234 — the branches a new person can be placed at (owner only; anybody else gets no picker).
      api.branchSettings().then((b) => b.branches.map(({ id, name }) => ({ id, name }))).catch(() => []),
    ]);
  } catch (error) {
    return (
      <>
        <PageHeader title={tn('staffTitle')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
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
        orgHours={settings.workingHours}
        branches={branches.length > 1 ? branches : []}
      />
    </>
  );
}

/**
 * Jira GRW-192 — the vertical names this screen, not us. A clinic reads
 * "Doctors" / "Patients" / "Visits" here; a garage "Mechanics" / "Jobs".
 */
export const generateMetadata = () => labelledTitle('providers', TITLE_FALLBACK.providers);
