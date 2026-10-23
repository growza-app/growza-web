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
  /*
   * Restaurant QA 2026-10-24 — "Client phone numbers" hides who a BOOKING is for (the booking repository is its only
   * reader). A shop has no bookings, so in a shop the switch moved nothing: it is not offered there. Unknown → shown.
   */
  let shop = false;
  try {
    shop = (await api.me()).surface === 'shop';
  } catch {
    shop = false;
  }
  // Jira GRW-230 · GRW-396 — who sees what is the same for every branch, and says so.
  return (
    <>
      <ReportAccessForm initial={settings} />
      {shop ? null : <ClientContactForm initial={settings} />}
      {/* Below the settings, not above them (design review, 2026-10-07): the rules are what
          this screen is for, and whether to push them to every branch is decided after reading them. */}
      <BranchScopeNote settings={settings} branchName={null} sameForAll topic="reportAccess" />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Who sees what');
