import { redirect } from 'next/navigation';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { screenTitle } from '../../lib/page-title';
import { guardLive, guardScreen } from '../../lib/screen-guard';
import { getTranslations } from 'next-intl/server';
import { ImportClient } from './ImportClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Import orders');

/**
 * Jira GRW-619 — bring in the order report downloaded from Flipkart or Amazon.
 *
 * Owner and manager only, as the API is: the front desk is offered the Orders list, not this. Guarded like it, and a role the
 * API would refuse is bounced back to the list rather than shown a screen that answers 403.
 */
export default async function ImportOrdersPage() {
  await guardScreen('/orders');
  // Owner, 2026-10-24 — a Flipkart/Amazon screen: a business with no marketplaces (a restaurant) is sent Home, not shown it.
  await guardLive('/orders/import');
  const t = await getTranslations('orders.import');
  let allowed = true;
  try {
    const role = (await api.me()).member?.role;
    allowed = role === undefined || role === 'owner' || role === 'manager';
  } catch {
    allowed = true;
  }
  if (!allowed) redirect('/orders');
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="page-body imp-page">
        <ImportClient />
      </div>
    </>
  );
}
