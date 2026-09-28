import { screenTitle } from '../../lib/page-title';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadScopedSettings, scopeKey } from '../scope';
import { WorkingHoursForm } from './WorkingHoursForm';
import { BranchScopeNote } from '../BranchScopeNote';
import { HOURS_KEYS } from '../branch-keys';

export const dynamic = 'force-dynamic';

export default async function WorkingHoursSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-230 · GRW-396 — the header branch's hours; a one-branch business's own.
  const { settings, branchName, loadError } = await loadScopedSettings(searchParams);
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  return (
    <>
      <BranchScopeNote key={`note:${scopeKey(settings)}`} settings={settings} branchName={branchName} keys={HOURS_KEYS} topic="hours" />
      <WorkingHoursForm key={scopeKey(settings)} initial={settings} branchName={branchName} />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Working hours');
