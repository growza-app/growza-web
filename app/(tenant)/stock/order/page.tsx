import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { OrderClient } from './OrderClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('What to order');

/**
 * Jira GRW-633 — what to order before the season.
 *
 * Owner and manager only, as the API is: the front desk is sent back to Stock. The list is read by the client (it is paged and filtered
 * on the server, and the owner's numbers are saved as they type them).
 */
export default async function OrderPage() {
  await guardScreen('/stock');
  const t = await getTranslations('products.reorder');
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
      <div className="page-body srp-page ro-page">
        <OrderClient />
      </div>
    </>
  );
}
