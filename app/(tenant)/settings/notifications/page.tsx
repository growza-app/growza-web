import { screenTitle } from '../../lib/page-title';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { api } from '../../lib/api';
import { loadScopedSettings, scopeKey } from '../scope';
import { RemindersForm } from './RemindersForm';
import { BranchScopeNote } from '../BranchScopeNote';
import { REMINDER_KEYS } from '../branch-keys';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  /**
   * Jira GRW-158 · GRW-165 — both, together, because the answer to "will these
   * actually be sent?" is as much a part of this screen as the rules are.
   *
   * `me` is allowed to fail on its own without taking the screen down: the
   * rules are still worth editing, and an unknown answer renders as NOT live,
   * which is the honest direction — it says "not yet" about something that
   * genuinely does not send.
   */
  // Jira GRW-230 · GRW-396 — the header branch's reminders; a one-branch business's own.
  const [{ settings, branchName, loadError }, me] = await Promise.all([loadScopedSettings(searchParams), api.me().catch(() => null)]);
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  return (
    <>
      <BranchScopeNote key={`note:${scopeKey(settings)}`} settings={settings} branchName={branchName} keys={REMINDER_KEYS} topic="reminders" />
      <RemindersForm key={scopeKey(settings)} initial={settings} branchName={branchName} whatsappLive={me?.whatsapp?.booking ?? false} />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Notifications');
