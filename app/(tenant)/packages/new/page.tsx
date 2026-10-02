import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { PackageBuilder } from '../PackageBuilder';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { guardScreen } from '../../lib/screen-guard';

export const dynamic = 'force-dynamic';

export default async function NewPackagePage() {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/packages');
  const t = await getTranslations('packages');
  let services;
  try {
    services = await api.services();
  } catch (error) {
    return (
      <>
        <PageHeader title={t('newTitle')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  return (
    <div className="page-body">
      <PackageBuilder services={services} />
    </div>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('New package');
