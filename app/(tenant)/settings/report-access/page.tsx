import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { BranchScopeNote } from '../BranchScopeNote';
import { ReportAccessForm } from './ReportAccessForm';

export const dynamic = 'force-dynamic';

export default async function ReportAccessSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  let settings;
  try {
    settings = await api.settings();
  } catch (error) {
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  // Jira GRW-230 Phase 1 — report access is the same for every branch.
  const { branch } = await searchParams;
  return (
    <>
      {branch ? <BranchScopeNote settings={settings} branchName={null} sameForAll topic="reportAccess" /> : null}
      <ReportAccessForm initial={settings} />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Who sees Reports');
