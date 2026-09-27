import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { BranchScopeNote } from '../BranchScopeNote';
import { TeamAccessPanel } from './TeamAccessPanel';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-63 · GRW-67 — who else can sign in to this business.
 *
 * Deliberately separate from Staff (`/providers`): a provider is somebody the
 * diary can book, and a member is somebody who can log in. They are usually the
 * same person, and are not the same thing — a receptionist logs in and is never
 * booked, and a visiting stylist is booked and never logs in.
 */
export default async function TeamSettingsPage() {
  /**
   * The roster comes with the invites (GRW-171): a `staff` invite has to name
   * WHICH stylist the person is, and the picker cannot offer a list it does
   * not have. Its own failure is not fatal — an owner can still invite a
   * receptionist, who needs no provider — so it degrades to an empty list
   * rather than taking the screen down with it.
   */
  const [initial, providers, settings, members, me] = await Promise.all([
    // Kept as a result, not swallowed: a busy API (429) and a down one are told apart in the banner below.
    api.teamInvites().then((ok) => ({ ok }), (error: unknown) => ({ error })),
    api.providers().catch(() => []),
    api.settings().catch(() => null),
    api.teamMembers().catch(() => null),
    api.me().catch(() => null),
  ]);
  if ('error' in initial) return <LoadErrorBanner kind={loadErrorKind(initial.error)} />;
  return (
    <>
      {/* Jira GRW-230 — invites are for the whole business; Jira GRW-237 — a receptionist's branch is chosen on the invite. */}
      {settings ? <BranchScopeNote settings={settings} branchName={null} sameForAll topic="teamAccess" /> : null}
      <TeamAccessPanel
        initial={initial.ok.invites}
        providers={providers}
        initialMembers={members?.members ?? []}
        branches={me?.branches ?? []}
      />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Team access');
