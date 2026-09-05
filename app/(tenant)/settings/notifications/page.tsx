import { api } from '../../lib/api';
import { RemindersForm } from './RemindersForm';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage() {
  /**
   * Jira GRW-158 · GRW-165 — both, together, because the answer to "will these
   * actually be sent?" is as much a part of this screen as the rules are.
   *
   * `me` is allowed to fail on its own without taking the screen down: the
   * rules are still worth editing, and an unknown answer renders as NOT live,
   * which is the honest direction — it says "not yet" about something that
   * genuinely does not send.
   */
  const [settings, me] = await Promise.all([api.settings().catch(() => null), api.me().catch(() => null)]);
  if (!settings) return <div className="banner">Could not load settings — check the server is running.</div>;
  return <RemindersForm initial={settings} whatsappLive={me?.whatsapp?.booking ?? false} />;
}
