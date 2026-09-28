import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { BranchesForm } from './BranchesForm';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  let data, settings, me;
  try {
    // Jira GRW-385 — the business's number, for each branch's booking link; the demo, for "Try it".
    [data, settings, me] = await Promise.all([api.branchSettings(), api.settings().catch(() => null), api.me().catch(() => null)]);
  } catch (error) {
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  return <BranchesForm initial={data.branches} whatsappNumber={settings?.tenant.phone ?? null} demo={Boolean(me?.whatsapp?.demo)} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Branches');
