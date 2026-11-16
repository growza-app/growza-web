import { redirect } from 'next/navigation';
import { screenTitle } from '../../../lib/page-title';
import { guardScreen } from '../../../lib/screen-guard';
import { api, ApiError } from '../../../lib/api';
import { RoomSetup } from './RoomSetup';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-719 — one branch's room: its areas and the tables in each.
 *
 * The owner and a manager (BR-04); anyone else is sent back to Settings, and the API refuses them besides. A branch
 * with Table orders off has no room to set up: it is sent back to the switches, where the owner can turn it on.
 */
export default async function RoomSetupPage({ params }: { params: Promise<{ branchId: string }> }) {
  await guardScreen('/settings/tables');
  const { branchId } = await params;
  const me = await api.me().catch(() => null);
  const role = me?.member?.role ?? 'owner';
  if (role !== 'owner' && role !== 'manager') redirect('/settings');
  const branch = (me?.branches ?? []).find((b) => b.id === branchId);
  if (me && (!branch || !branch.tableOrders)) redirect('/settings/tables');

  let areas = null;
  try {
    areas = (await api.diningTables(branchId)).areas;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) redirect('/settings/tables');
  }
  return <RoomSetup branchId={branchId} branchName={branch?.name ?? ''} initial={areas} />;
}

export const metadata = screenTitle('Tables');
