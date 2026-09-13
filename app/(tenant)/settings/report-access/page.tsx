import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { BranchScopeNote } from '../BranchScopeNote';
import { ReportAccessForm } from './ReportAccessForm';

export const dynamic = 'force-dynamic';

export default async function ReportAccessSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const settings = await api.settings().catch(() => null);
  if (!settings) return <div className="banner">Could not load settings — check the server is running.</div>;
  // Jira GRW-230 Phase 1 — report access is the same for every branch.
  const { branch } = await searchParams;
  return (
    <>
      {branch ? <BranchScopeNote settings={settings} branchName={null} sameForAll what="who sees Reports" /> : null}
      <ReportAccessForm initial={settings} />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Who sees Reports');
