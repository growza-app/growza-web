import { screenTitle } from '../../lib/page-title';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { api } from '../../lib/api';
import { loadScopedSettings, scopeKey } from '../scope';
import { RemindersForm } from './RemindersForm';

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
  // Jira GRW-230 — the picked branch's reminders, or the business's.
  const [{ settings, branchName, loadError }, me] = await Promise.all([loadScopedSettings(searchParams), api.me().catch(() => null)]);
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  return <RemindersForm key={scopeKey(settings)} initial={settings} branchName={branchName} whatsappLive={me?.whatsapp?.booking ?? false} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Notifications');
