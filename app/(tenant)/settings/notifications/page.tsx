import { api } from '../../lib/api';
import { RemindersForm } from './RemindersForm';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage() {
  const settings = await api.settings().catch(() => null);
  if (!settings) return <div className="banner">Could not load settings — check the server is running.</div>;
  return <RemindersForm initial={settings} />;
}
