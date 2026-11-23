import { getTranslations } from 'next-intl/server';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { sendRestaurantToTab } from '../../lib/restaurant-reports-redirect';
import { SellersClient } from './SellersClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Top sellers');

/**
 * Jira GRW-632 — what sells, and what sits.
 *
 * Owner and manager only, as the API is: the front desk is sent back to Stock. The two views are read by the client (they are paged
 * and filtered on the server and re-read when a filter changes).
 */
export default async function SellersPage() {
  // Jira GRW-754 — who may open it is the role's Reports (grid), or owner and manager for a fixed role: one rule, shared with the tab bar.
  await guardScreen('/stock/sellers');
  await sendRestaurantToTab('items');
  const t = await getTranslations('products.sellers');
  let timezone = 'Asia/Kolkata';
  try {
    timezone = (await api.me()).tenant?.timezone ?? timezone;
  } catch {
    // The shop's zone is a nicety for the dates; the screen still works in India's.
  }
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="page-body srp-page">
        <RetailReportsNav active="sellers" />
        <SellersClient timezone={timezone} />
      </div>
    </>
  );
}
