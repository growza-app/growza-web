import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { RewardsForm } from './RewardsForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-648 — Settings › Reward points.
 *
 * The one screen that decides whether this business has a loyalty scheme at all. Everything downstream — the
 * points a bill earns, the balance on a client's card, the "use points" row at the till — is drawn or not
 * drawn by the switch here.
 *
 * Owner only, and the API agrees: both routes are classified `owner` in `shared/src/route-pages.ts`, so a
 * typed address is not a way in — this redirect only saves a role the trip. An earn rate is a standing promise
 * to every client the business has, and it is the owner who pays for it.
 *
 * Read here rather than in the form so the screen knows before it draws whether points are available on this
 * plan at all: a form that rendered a switch and then found out would have offered something it cannot do.
 */
export default async function RewardsSettingsPage() {
  const me = await api.me().catch(() => null);
  if (me?.member && me.member.role !== 'owner') redirect('/settings');

  const settings = await api.rewardSettings().catch(() => null);
  return <RewardsForm initial={settings} />;
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Reward points');
