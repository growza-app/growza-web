import { getTranslations } from 'next-intl/server';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { sendRestaurantToTab } from '../../lib/restaurant-reports-redirect';
import { PaymentsReport } from '../money/PaymentsReport';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Payments');

/** Owner, 2026-11-14 — a counter business's Payments, beside the counter report on its tab bar (`reports/money/PaymentsReport.tsx`). */
export default async function Page() {
  await guardScreen('/reports/payments');
  await sendRestaurantToTab('sales', 'sales');
  const t = await getTranslations('moneyReports.tabs');
  return (
    <>
      <PageHeader title={t('payments')} />
      <div className="page-body srp-page">
        <RetailReportsNav active="payments" />
        <PaymentsReport />
      </div>
    </>
  );
}
