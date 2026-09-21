import { screenTitle } from '../../lib/page-title';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadScopedSettings, scopeKey } from '../scope';
import { ProfileForm } from './ProfileForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-230 — with a branch picked, that branch's profile.
  const { settings, branchName, loadError } = await loadScopedSettings(searchParams);
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  return <ProfileForm key={scopeKey(settings)} initial={settings} branchCount={settings.branchCount} branchName={branchName} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Business profile');
