import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { BranchScopeNote } from '../BranchScopeNote';
import { BookingRulesForm } from './BookingRulesForm';

export const dynamic = 'force-dynamic';

export default async function BookingSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const settings = await api.settings().catch(() => null);
  if (!settings) return <div className="banner">Could not load settings — check the server is running.</div>;
  // Jira GRW-230 Phase 1 — booking rules are the same for every branch; say so when a branch is picked.
  const { branch } = await searchParams;
  return (
    <>
      {branch ? <BranchScopeNote settings={settings} branchName={null} sameForAll what="booking rules" /> : null}
      <BookingRulesForm initial={settings} />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Booking rules');
