import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { ChannelsClient } from './ChannelsClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Where the money came from');

/**
 * Jira GRW-634 — where the money came from: the counter, Flipkart and Amazon side by side.
 *
 * It is money, so the owner's and manager's only, as the API is: the front desk is sent back to Stock and the response carries no money for it.
 */
export default async function ChannelsPage() {
  await guardScreen('/stock');
  const t = await getTranslations('products.channels');
  let allowed = true;
  try {
    const me = await api.me();
    const role = me.member?.role;
    allowed = role === undefined || role === 'owner' || role === 'manager';
  } catch {
    allowed = true;
  }
  if (!allowed) redirect('/stock');
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="page-body srp-page">
        <RetailReportsNav active="channels" />
        <ChannelsClient />
      </div>
    </>
  );
}
