import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { ChannelsForm } from './ChannelsForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-641 — Settings › Online selling: which shop each marketplace sells from.
 *
 * A shop's. A business with a diary has no marketplaces (the API answers it 404), so it is sent back to Settings rather than shown a form
 * that cannot load. Not scoped by a branch picker: the whole business's choice, one row per marketplace.
 */
export default async function ChannelsSettingsPage() {
  try {
    const me = await api.me();
    if (me.surface !== 'shop') redirect('/settings');
  } catch (error) {
    // `redirect` throws its own control-flow signal: let it through, and report only a real failure to read.
    if (error && typeof error === 'object' && 'digest' in error) throw error;
  }
  let data;
  try {
    data = await api.channelBranches();
  } catch (error) {
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  return <ChannelsForm initial={data} />;
}

export const metadata = screenTitle('Online selling');
