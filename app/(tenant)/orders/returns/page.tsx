import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { ReturnsClient } from './ReturnsClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Returns');

/**
 * Jira GRW-635 — what came back, and why. Owner and manager only, as the API is: the front desk is sent back to Orders.
 */
export default async function ReturnsPage() {
  await guardScreen('/orders');
  const t = await getTranslations('orders.returns');
  // Not signed in as someone who may read it — or not able to tell — is not "allowed": the front desk is sent back to Orders.
  let allowed = false;
  try {
    const me = await api.me();
    const role = me.member?.role;
    allowed = role === undefined || role === 'owner' || role === 'manager';
  } catch {
    allowed = false;
  }
  if (!allowed) redirect('/orders');
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="page-body srp-page">
        <RetailReportsNav active="returns" />
        <ReturnsClient />
      </div>
    </>
  );
}
