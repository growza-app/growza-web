import { screenTitle } from '../../lib/page-title';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadScopedSettings, scopeKey } from '../scope';
import { BookingRulesForm } from './BookingRulesForm';

export const dynamic = 'force-dynamic';

export default async function BookingSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-248 — the picked branch's booking rules and closed days, or the business's.
  const { settings, branchName, loadError } = await loadScopedSettings(searchParams);
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  return <BookingRulesForm key={scopeKey(settings)} initial={settings} branchName={branchName} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Booking rules');
