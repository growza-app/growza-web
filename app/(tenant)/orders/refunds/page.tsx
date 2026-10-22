import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { RefundsClient } from './RefundsClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Refunds');

/**
 * Jira GRW-637 — what was refunded on online orders, one row per refund. It is money, so the owner's and manager's only, as the API is: the front
 * desk is sent back to Orders, and so is a viewer the lookup could not vouch for.
 */
export default async function RefundsPage() {
  await guardScreen('/orders');
  const t = await getTranslations('orders.refunds');
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
        <RetailReportsNav active="refunds" />
        <RefundsClient />
      </div>
    </>
  );
}
