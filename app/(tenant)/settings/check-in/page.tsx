import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { loadScopedSettings, scopeKey } from '../scope';
import { CheckInForm } from './CheckInForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-563 — Settings › Phone check-in: the header branch's pin, radius and the two switches.
 *
 * The pin is the branch's own (`location.geo_*`), which is also what support may have set at enrolment —
 * so an owner opening this finds it pre-filled, with the fence still off until they switch it on.
 */
export default async function CheckInSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { settings, branchName, loadError } = await loadScopedSettings(searchParams);
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  let branches;
  try {
    branches = (await api.branchSettings()).branches;
  } catch (error) {
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  // The header's branch, else the main one — the same branch every other branch tab shows (`scope.ts`).
  const branch = branches.find((b) => b.id === settings.scope.locationId) ?? branches.find((b) => b.isPrimary) ?? branches[0] ?? null;
  if (!branch) return <LoadErrorBanner kind="down" />;
  return <CheckInForm key={scopeKey(settings)} branch={branch} branchName={branchName} branchCount={settings.branchCount} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Phone check-in');
