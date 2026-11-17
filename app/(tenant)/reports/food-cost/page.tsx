import { getTranslations } from 'next-intl/server';
import { PageHeader } from '../../components/PageHeader';
import { RetailReportsNav } from '../../components/RetailReportsNav';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { FoodCostReport } from '../money/FoodCostReport';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Food cost');

/** Jira GRW-739 — what the food in each day's sales cost, and what was wasted or went missing (`reports/money/FoodCostReport.tsx`). */
export default async function Page() {
  await guardScreen('/reports/food-cost');
  const t = await getTranslations('moneyReports.tabs');
  return (
    <>
      <PageHeader title={t('foodCost')} />
      <div className="page-body srp-page">
        <RetailReportsNav active="foodCost" />
        <FoodCostReport />
      </div>
    </>
  );
}
