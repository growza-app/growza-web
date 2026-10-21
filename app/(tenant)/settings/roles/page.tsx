import { notFound } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { api, ApiError } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { RolesScreen } from './RolesScreen';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-72 — Settings › Roles. A shop's owner only: a salon, or anyone who is not the owner, is told there is nothing here,
 * the same answer the API gives them.
 */
export default async function RolesSettingsPage() {
  let payload;
  let team;
  try {
    payload = await api.roles();
    // Each swallowed on its own: the roles are what this screen is for, and a team list that cannot load must not take them with it.
    const [members, invites, overview, branches] = await Promise.all([
      api.teamMembers().then((r) => r.members, () => []),
      api.teamInvites().then((r) => r.invites, () => []),
      api.providersOverview().then((o) => o.providers, () => []),
      api.branchSettings().then((b) => b.branches.map(({ id, name }) => ({ id, name })), () => []),
    ]);
    team = { members, invites, providers: overview, branches };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound();
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }
  return <RolesScreen initial={payload} team={team} />;
}

export const metadata = screenTitle('Roles');
