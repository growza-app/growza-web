import { screenTitle } from '../lib/page-title';
import { guardLive } from '../lib/screen-guard';
import { redirect } from 'next/navigation';
import { api } from '../lib/api';
import { mayUse } from '../lib/nav-policy';
import { SearchClient } from './SearchClient';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  // Jira GRW-556 — this screen opens at go-live; before it, say so rather than draw what the API would refuse.
  await guardLive('/search');
  let timezone = 'Asia/Kolkata';
  let showBranch = false;
  let role: string | null = null;
  try {
    const me = await api.me();
    timezone = me.tenant?.timezone ?? timezone;
    // Jira GRW-393 — `/me` lists only the branches this person sees; several means rows need their branch.
    showBranch = (me.branches?.length ?? 0) > 1;
    role = me.member?.role ?? null;
  } catch {
    // The search field still works; only date formatting falls back.
  }

  /**
   * Jira GRW-409 — the header no longer offers this screen to a role `GET /api/v1/search` refuses; a bookmark
   * must not bring them back to a box whose every search answers 403. The front desk finds people on the
   * Clients list (GRW-199), so that is where they land; anybody else, Home.
   */
  if (!mayUse(role, 'search')) redirect(mayUse(role, 'clients.list') ? '/customers' : '/');

  return <SearchClient timezone={timezone} showBranch={showBranch} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Search');
