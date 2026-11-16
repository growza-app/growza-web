import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { api } from '../../lib/api';
import { TablesForm } from './TablesForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-718 — Settings › Tables: the owner says which branches seat their guests.
 *
 * Owner only, and the API agrees: both routes are classified `owner` in `shared/src/route-pages.ts`, so a typed
 * address is not a way in — this redirect only saves a role the trip. A business whose vertical seats nobody is sent
 * Home by `guardScreen` (`areaAllows` closes the address), and the API refuses it too (the `dining.tables` area).
 */
export default async function TablesSettingsPage() {
  await guardScreen('/settings/tables');
  const me = await api.me().catch(() => null);
  if (me?.member && me.member.role !== 'owner') redirect('/settings');

  const initial = await api.tableOrders().catch(() => null);
  return <TablesForm initial={initial?.branches ?? null} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Tables');
