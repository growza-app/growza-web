import { screenTitle } from '../lib/page-title';
import { api } from '../lib/api';
import { SearchClient } from './SearchClient';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  let timezone = 'Asia/Kolkata';
  let showBranch = false;
  try {
    const me = await api.me();
    timezone = me.tenant?.timezone ?? timezone;
    // Jira GRW-393 — `/me` lists only the branches this person sees; several means rows need their branch.
    showBranch = (me.branches?.length ?? 0) > 1;
  } catch {
    // The search field still works; only date formatting falls back.
  }

  return <SearchClient timezone={timezone} showBranch={showBranch} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Search');
