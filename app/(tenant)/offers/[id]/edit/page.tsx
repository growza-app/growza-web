import { screenTitle } from '../../../lib/page-title';
import { notFound } from 'next/navigation';
import { api, ApiError } from '../../../lib/api';
import { PageHeader } from '../../../components/PageHeader';
import { ComboBuilder } from '../../ComboBuilder';

export const dynamic = 'force-dynamic';

export default async function EditComboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let services, offer;
  try {
    [services, offer] = await Promise.all([api.services(), api.offer(id)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title="Edit combo" />
        <div className="page-body">
          <div className="banner">
            <strong>Cannot reach the server.</strong> Ask your developer to start it, or run <code>npm run dev</code>.
          </div>
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
