import { getTranslations } from 'next-intl/server';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { sendRestaurantToTab } from '../../lib/restaurant-reports-redirect';
import { ShopCustomersReport } from '../ShopCustomersReport';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Customers');

/**
 * Owner, 2026-11-28 — a counter business's Customers, beside the money tabs on its tab bar (`reports/ShopCustomersReport.tsx`).
 * A restaurant has the same report as its own Guests tab, and is sent there.
 */
export default async function Page() {
  await guardScreen('/reports/customers');
  await sendRestaurantToTab('customers', 'customers');
  const t = await getTranslations('reports');
  return (
    <>
      <PageHeader title={t('shopCustomersTab')} />
      <div className="page-body srp-page">
        <RetailReportsNav active="customers" />
        <ShopCustomersReport />
      </div>
    </>
  );
}
