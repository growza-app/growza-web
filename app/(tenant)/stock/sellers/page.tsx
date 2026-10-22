import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { SellersClient } from './SellersClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('What sells');

/**
 * Jira GRW-632 — what sells, and what sits.
 *
 * Owner and manager only, as the API is: the front desk is sent back to Stock. The two views are read by the client (they are paged
 * and filtered on the server and re-read when a filter changes).
 */
export default async function SellersPage() {
  await guardScreen('/stock');
  const t = await getTranslations('products.sellers');
  let allowed = true;
  let timezone = 'Asia/Kolkata';
  try {
    const me = await api.me();
    timezone = me.tenant?.timezone ?? timezone;
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
        <SellersClient timezone={timezone} />
      </div>
    </>
  );
}
