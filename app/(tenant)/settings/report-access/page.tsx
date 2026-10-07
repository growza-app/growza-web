import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { BranchScopeNote } from '../BranchScopeNote';
import { ReportAccessForm } from './ReportAccessForm';
import { ClientContactForm } from './ClientContactForm';

export const dynamic = 'force-dynamic';

export default async function ReportAccessSettingsPage() {
  let settings;
  try {
    settings = await api.settings();
  } catch (error) {
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  // Jira GRW-230 · GRW-396 — who sees what is the same for every branch, and says so.
  return (
    <>
      <ReportAccessForm initial={settings} />
      <ClientContactForm initial={settings} />
      {/* Below the settings, not above them (design review, 2026-10-07): the rules are what
          this screen is for, and whether to push them to every branch is decided after reading them. */}
      <BranchScopeNote settings={settings} branchName={null} sameForAll topic="reportAccess" />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Who sees what');
