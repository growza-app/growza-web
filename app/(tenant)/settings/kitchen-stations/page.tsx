import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { guardScreen } from '../../lib/screen-guard';
import { api } from '../../lib/api';
import { KitchenStationsSetup } from './KitchenStationsSetup';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-733 — Settings › Kitchen stations: name a branch's stations (Tandoor, Bar) and give each menu category one,
 * so each dish prints and shows only at its own station.
 *
 * The owner and a manager, like setting out the room (GRW-719 BR-04); anyone else is sent back to Settings, and the API
 * refuses them besides. A business with no kitchen is sent Home by `guardScreen` (`areaAllows`), and the API refuses it.
 */
export default async function KitchenStationsPage() {
  await guardScreen('/settings/kitchen-stations');
  const me = await api.me().catch(() => null);
  const role = me?.member?.role ?? 'owner';
  if (role !== 'owner' && role !== 'manager') redirect('/settings');
  const branches = (me?.branches ?? []).map((b) => ({ id: b.id, name: b.name }));
  return <KitchenStationsSetup branches={branches} />;
}

export const metadata = screenTitle('Kitchen stations');
