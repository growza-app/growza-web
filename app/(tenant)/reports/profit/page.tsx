import { getTranslations } from 'next-intl/server';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { sendRestaurantToTab } from '../../lib/restaurant-reports-redirect';
import { ProfitReport } from '../money/ProfitReport';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Profit');

/** Owner, 2026-11-14 — a counter business's Profit, beside the counter report on its tab bar (`reports/money/ProfitReport.tsx`). */
export default async function Page() {
  await guardScreen('/reports/profit');
  await sendRestaurantToTab('items');
  const t = await getTranslations('moneyReports.tabs');
  return (
    <>
      <PageHeader title={t('profit')} />
      <div className="page-body srp-page">
        <RetailReportsNav active="profit" />
        <ProfitReport />
      </div>
    </>
  );
}
