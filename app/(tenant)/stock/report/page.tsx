import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { StockReportClient } from './StockReportClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Stock report');

/**
 * Jira GRW-631 — what is on the shelf, size by size, and what it is worth.
 *
 * Owner and manager only, as the API is (the front desk counts and sells stock; it does not value it): the desk is sent back to
 * Stock. The report itself is read by the client — it is paged and filtered on the server and re-read when a filter changes.
 */
export default async function StockReportPage() {
  await guardScreen('/stock');
  const t = await getTranslations('products.stockReport');
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
        <StockReportClient />
      </div>
    </>
  );
}
