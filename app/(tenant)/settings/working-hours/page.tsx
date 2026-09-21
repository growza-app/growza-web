import { screenTitle } from '../../lib/page-title';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadScopedSettings, scopeKey } from '../scope';
import { WorkingHoursForm } from './WorkingHoursForm';

export const dynamic = 'force-dynamic';

export default async function WorkingHoursSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-230 — the picked branch's hours, or the business's.
  const { settings, branchName, loadError } = await loadScopedSettings(searchParams);
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  return <WorkingHoursForm key={scopeKey(settings)} initial={settings} branchName={branchName} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Working hours');
