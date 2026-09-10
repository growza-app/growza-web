import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { WorkingHoursForm } from './WorkingHoursForm';

export const dynamic = 'force-dynamic';

export default async function WorkingHoursSettingsPage() {
  const settings = await api.settings().catch(() => null);
  if (!settings) return <div className="banner">Could not load settings — check the server is running.</div>;
  return <WorkingHoursForm initial={settings} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Working hours');
