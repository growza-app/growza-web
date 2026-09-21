import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ComboBuilder } from '../ComboBuilder';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';

export const dynamic = 'force-dynamic';

export default async function NewComboPage() {
  const t = await getTranslations('offers');
  let services;
  try {
    services = await api.services();
  } catch (error) {
    return (
      <>
        <PageHeader title={t('newComboTitle')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  return (
    <div className="page-body">
      <ComboBuilder services={services} />
    </div>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('New offer');
