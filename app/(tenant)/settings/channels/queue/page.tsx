import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../../../lib/api';
import { PageHeader } from '../../../components/PageHeader';
import { screenTitle } from '../../../lib/page-title';
import { QueueClient } from './QueueClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Online selling queue');

/**
 * Jira GRW-626 — what is waiting for a marketplace and what failed, with a way to try again. Reached from Settings › Online selling.
 *
 * A shop's, and the owner's and manager's, as the API is: a business with a diary has no marketplaces and the desk is sent back to Settings. The
 * list is read by the client — it is paged on the server and read again after a retry.
 */
export default async function ChannelQueuePage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const t = await getTranslations('settingsChannelQueue');
  const channel = (await searchParams).channel === 'amazon' ? 'amazon' : 'flipkart';
  let timezone = 'Asia/Kolkata';
  try {
    const me = await api.me();
    if (me.surface !== 'shop') redirect('/settings');
    timezone = me.tenant?.timezone ?? timezone;
    const role = me.member?.role;
    if (!(role === undefined || role === 'owner' || role === 'manager')) redirect('/settings');
  } catch (error) {
    // `redirect` throws its own control-flow signal: let it through, and report only a real failure to read.
    if (error && typeof error === 'object' && 'digest' in error) throw error;
  }
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="page-body cq-page">
        <QueueClient channel={channel} timezone={timezone} />
      </div>
    </>
  );
}
