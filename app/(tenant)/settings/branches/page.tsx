import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { BranchesForm } from './BranchesForm';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const data = await api.branchSettings().catch(() => null);
  if (!data) return <div className="banner">Could not load your branches — check the server is running.</div>;
  return <BranchesForm initial={data.branches} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Branches');
