import { api } from '../../lib/api';
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
  const [initial, providers] = await Promise.all([
    api.teamInvites().catch(() => null),
    api.providers().catch(() => []),
  ]);
  if (!initial) return <div className="banner">Could not load invites — check the server is running.</div>;
  return <TeamAccessPanel initial={initial.invites} providers={providers} />;
}
