import { screenTitle } from '../../lib/page-title';
import { loadScopedSettings, scopeKey } from '../scope';
import { BookingRulesForm } from './BookingRulesForm';

export const dynamic = 'force-dynamic';

export default async function BookingSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-248 — the picked branch's booking rules and closed days, or the business's.
  const { settings, branchName } = await loadScopedSettings(searchParams);
  if (!settings) return <div className="banner">Could not load settings — check the server is running.</div>;
  return <BookingRulesForm key={scopeKey(settings)} initial={settings} branchName={branchName} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Booking rules');
