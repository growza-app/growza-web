import { screenTitle } from '../../lib/page-title';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadScopedSettings, scopeKey } from '../scope';
import { BookingRulesForm } from './BookingRulesForm';
import { BranchScopeNote } from '../BranchScopeNote';
import { BOOKING_RULE_KEYS } from '../branch-keys';

export const dynamic = 'force-dynamic';

export default async function BookingSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-248 · GRW-396 — the header branch's booking rules and closed days; a one-branch business's own.
  const { settings, branchName, loadError } = await loadScopedSettings(searchParams);
  if (!settings) return <LoadErrorBanner kind={loadError ?? 'down'} />;
  return (
    <>
      <BookingRulesForm key={scopeKey(settings)} initial={settings} branchName={branchName} />
      {/* Below the settings, not above them (design review, 2026-10-07): the rules are what
          this screen is for, and whether to push them to every branch is decided after reading them. */}
      <BranchScopeNote key={`note:${scopeKey(settings)}`} settings={settings} branchName={branchName} keys={BOOKING_RULE_KEYS} topic="bookingRules" />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Booking rules');
