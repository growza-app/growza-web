import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../../../lib/page-title';
import { notFound } from 'next/navigation';
import { api, ApiError } from '../../../lib/api';
import { PageHeader } from '../../../components/PageHeader';
import { PackageBuilder } from '../../PackageBuilder';
import { LoadErrorBanner } from '../../../components/LoadErrorBanner';
import { loadErrorKind } from '../../../lib/load-error';
import { guardScreen, guardWritable } from '../../../lib/screen-guard';

export const dynamic = 'force-dynamic';

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/packages');
  // Jira GRW-556 (follow-up) — see /packages/new.
  await guardWritable('/packages');
  const { id } = await params;
  const t = await getTranslations('packages');

  let services, offer;
  try {
    [services, offer] = await Promise.all([api.services(), api.offer(id)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title={t('editTitle')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(err)} />
        </div>
      </>
    );
  }

  return (
    <div className="page-body">
      <PackageBuilder services={services} initialOffer={offer} />
    </div>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Edit package');
