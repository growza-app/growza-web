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
  const initial = await api.teamInvites().catch(() => null);
  if (!initial) return <div className="banner">Could not load invites — check the server is running.</div>;
  return <TeamAccessPanel initial={initial.invites} />;
}
