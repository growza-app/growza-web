import { screenTitle } from '../../lib/page-title';
import { loadScopedSettings, scopeKey } from '../scope';
import { ProfileForm } from './ProfileForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-230 — with a branch picked, that branch's profile.
  const { settings, branchName } = await loadScopedSettings(searchParams);
  if (!settings) return <div className="banner">Could not load settings — check the server is running.</div>;
  return <ProfileForm key={scopeKey(settings)} initial={settings} branchCount={settings.branchCount} branchName={branchName} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Business profile');
