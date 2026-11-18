import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { api } from '../../lib/api';
import { BillOffersSetup } from './BillOffersSetup';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-735 — Settings › Coupons and offers: a branch's coupon codes and its "buy one, get one" offers.
 *
 * The owner and a manager; anyone else is sent back to Settings, and the API refuses them besides. A business that
 * rings up no products is sent Home by `guardScreen` (`areaAllows`, SHOP_SETTINGS).
 */
export default async function BillOffersPage() {
  await guardScreen('/settings/offers');
  const me = await api.me().catch(() => null);
  const role = me?.member?.role ?? 'owner';
  if (role !== 'owner' && role !== 'manager') redirect('/settings');
  const branches = (me?.branches ?? []).map((b) => ({ id: b.id, name: b.name }));
  return <BillOffersSetup branches={branches} />;
}

export const metadata = screenTitle('Coupons and offers');
