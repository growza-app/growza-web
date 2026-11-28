import { getTranslations } from 'next-intl/server';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { sendRestaurantToTab } from '../../lib/restaurant-reports-redirect';
import { DiscountReport } from '../money/DiscountReport';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Discounts & free');

/** Owner, 2026-11-14 — a counter business's Discounts & free, beside the counter report on its tab bar (`reports/money/DiscountReport.tsx`). */
export default async function Page() {
  await guardScreen('/reports/discounts');
  await sendRestaurantToTab('sales', 'sales');
  const t = await getTranslations('moneyReports.tabs');
  return (
    <>
      <PageHeader title={t('discounts')} />
      <div className="page-body srp-page">
        <RetailReportsNav active="discounts" />
        <DiscountReport />
      </div>
    </>
  );
}
