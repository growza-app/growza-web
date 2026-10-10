import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { api } from '../../lib/api';
import { loadScopedSettings, scopeKey } from '../scope';
import { withBranch } from '../branch-link';
import { RemindersForm } from './RemindersForm';
import { BranchScopeNote } from '../BranchScopeNote';
import { REMINDER_KEYS } from '../branch-keys';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-230 · GRW-396 — the header branch's reminders; a one-branch business's own.
  const [{ settings, branchName, loadError }, me] = await Promise.all([loadScopedSettings(searchParams), api.me().catch(() => null)]);
  // Reminders go out by WhatsApp and nothing else: without it this screen sets times for a message never sent, and
  // the Settings row is hidden for that reason (owner, 2026-10-10). A bookmark or an old link lands on Settings,
  // keeping its branch. Only a `/me` that ANSWERED "off" sends it away — one that failed shows the screen rather
  // than bouncing a business that does send reminders off its own settings with no word why.
  if (me && !me.whatsapp?.booking) {
    const { branch } = await searchParams;
    redirect(withBranch('/settings', branch && branch !== 'all' ? branch : null));
  }
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  return (
    <>
      <RemindersForm key={scopeKey(settings)} initial={settings} branchName={branchName} />
      {/* Below the settings, not above them (design review, 2026-10-07): the rules are what
          this screen is for, and whether to push them to every branch is decided after reading them. */}
      <BranchScopeNote key={`note:${scopeKey(settings)}`} settings={settings} branchName={branchName} keys={REMINDER_KEYS} topic="reminders" />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Notifications');
