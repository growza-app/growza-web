import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../../../lib/page-title';
import { notFound } from 'next/navigation';
import { api, ApiError } from '../../../lib/api';
import { PageHeader } from '../../../components/PageHeader';
import { ComboBuilder } from '../../ComboBuilder';
import { LoadErrorBanner } from '../../../components/LoadErrorBanner';
import { loadErrorKind } from '../../../lib/load-error';
import { guardScreen } from '../../../lib/screen-guard';

export const dynamic = 'force-dynamic';

export default async function EditComboPage({ params }: { params: Promise<{ id: string }> }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/offers');
  const { id } = await params;
  const t = await getTranslations('offers');

  let services, offer;
  try {
    [services, offer] = await Promise.all([api.services(), api.offer(id)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title={t('editComboTitle')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(err)} />
        </div>
      </>
    );
  }

  return (
    <div className="page-body">
      <ComboBuilder services={services} initialOffer={offer} />
    </div>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Edit offer');
