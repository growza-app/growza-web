import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
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
export default async function TeamSettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  /**
   * The roster comes with the invites (GRW-171): a `staff` invite has to name
   * WHICH stylist the person is, and the picker cannot offer a list it does
   * not have. Its own failure is not fatal — an owner can still invite a
   * receptionist, who needs no provider — so it degrades to an empty list
   * rather than taking the screen down with it.
   */
  const [initial, providers, settings, members, me, { branch }] = await Promise.all([
    api.teamInvites().catch(() => null),
    api.providers().catch(() => []),
    api.settings().catch(() => null),
    api.teamMembers().catch(() => null),
    api.me().catch(() => null),
    searchParams,
  ]);
  if (!initial) return <div className="banner">Could not load invites — check the server is running.</div>;
  return (
    <>
      {/* Jira GRW-230 — invites are for the whole business; Jira GRW-237 — a receptionist's branch is chosen on the invite. */}
      {branch && settings ? <BranchScopeNote settings={settings} branchName={null} sameForAll topic="teamAccess" /> : null}
      <TeamAccessPanel
        initial={initial.invites}
        providers={providers}
        initialMembers={members?.members ?? []}
        branches={me?.branches ?? []}
      />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Team access');
