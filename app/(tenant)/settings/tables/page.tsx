import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { api } from '../../lib/api';
import { TablesForm } from './TablesForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-718 · GRW-719 — Settings › Tables: which branches seat their guests, and the way into each one's room.
 *
 * The owner switches Table orders per branch (GRW-718, owner only — the API refuses anyone else) and sets the room up.
 * A manager sets rooms up too (GRW-719 BR-04) but never flips a switch: they are shown the branches that are on, each
 * leading to its room, read from `/me`. Anyone else is sent back to Settings. A business whose vertical seats nobody
 * is sent Home by `guardScreen` (`areaAllows` closes the address), and the API refuses it too.
 */
export default async function TablesSettingsPage() {
  await guardScreen('/settings/tables');
  const me = await api.me().catch(() => null);
  const role = me?.member?.role ?? 'owner';
  if (role !== 'owner' && role !== 'manager') redirect('/settings');

  if (role === 'manager') {
    const on = (me?.branches ?? []).filter((b) => b.tableOrders).map((b) => ({ id: b.id, name: b.name, on: true }));
    return <TablesForm initial={on} canSwitch={false} />;
  }
  const initial = await api.tableOrders().catch(() => null);
  return <TablesForm initial={initial?.branches ?? null} canSwitch />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Tables');
