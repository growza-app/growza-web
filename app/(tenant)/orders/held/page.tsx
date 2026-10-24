import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { screenTitle } from '../../lib/page-title';
import { guardLive, guardScreen } from '../../lib/screen-guard';
import { HeldClient } from './HeldClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Waiting for a size');

/**
 * Jira GRW-620 — the worklist of codes holding marketplace orders back, with the one tap that fixes each.
 *
 * Owner and manager only, as the API is; the front desk is bounced to the Orders list. The list itself is read by the client (it is
 * paged and searched on the server, and re-read after every fix).
 */
export default async function HeldOrdersPage() {
  await guardScreen('/orders');
  // Owner, 2026-10-24 — a Flipkart/Amazon screen: a business with no marketplaces (a restaurant) is sent Home, not shown it.
  await guardLive('/orders/held');
  const t = await getTranslations('orders.held');
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
  if (!allowed) redirect('/orders');
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="page-body held-page">
        <HeldClient timezone={timezone} />
      </div>
    </>
  );
}
