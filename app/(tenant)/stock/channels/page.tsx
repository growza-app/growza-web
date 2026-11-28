import { getTranslations } from 'next-intl/server';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { sendRestaurantToTab } from '../../lib/restaurant-reports-redirect';
import { ChannelsClient } from './ChannelsClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Sales by channel');

/**
 * Jira GRW-634 — where the money came from: the counter, Flipkart and Amazon side by side.
 *
 * It is money, so the owner's and manager's only, as the API is: the front desk is sent back to Stock and the response carries no money for it.
 */
export default async function ChannelsPage() {
  // Jira GRW-754 — who may open it is the role's Reports (grid), or owner and manager for a fixed role: one rule, shared with the tab bar.
  await guardScreen('/stock/channels');
  await sendRestaurantToTab('sales', 'overview');
  const t = await getTranslations('products.channels');
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
