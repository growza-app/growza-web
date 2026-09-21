import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { BranchesForm } from './BranchesForm';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  let data;
  try {
    data = await api.branchSettings();
  } catch (error) {
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  return <BranchesForm initial={data.branches} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Branches');
