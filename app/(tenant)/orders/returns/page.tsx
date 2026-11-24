import { getTranslations } from 'next-intl/server';
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
  // Jira GRW-754 — who may open it is the role's Reports (grid), or owner and manager for a fixed role: one rule, shared with the tab bar.
  await guardScreen('/orders/returns');
  const t = await getTranslations('orders.returns');
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
