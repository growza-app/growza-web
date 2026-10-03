import { screenTitle } from '../../lib/page-title';
import { notFound } from 'next/navigation';
import { api, ApiError } from '../../lib/api';
import { loadErrorKind } from '../../lib/load-error';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { copy } from '../../lib/copy';
import { StaffEditClient } from './StaffEditClient';
import { guardScreen } from '../../lib/screen-guard';

export const dynamic = 'force-dynamic';

/**
 * Full-screen staff edit (design Turn 4). Replaces the old right-hand drawer:
 * the form now has room for hours and services side by side with the read-only
 * context an owner needs to judge a change (30-day scorecard, today's
 * remaining bookings) before saving it.
 */
export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/providers');
  const { id } = await params;

  let detail, services, day, stats, me, settings, branches;
  try {
    [me, detail, services, day, stats, settings, branches] = await Promise.all([
      api.me(),
      api.providerDetail(id),
      api.services(),
      api.providerDay(id).catch(() => null),
      api.providerStats(id).catch(() => null),
      Promise.resolve(null),
      // Jira GRW-234 — where this person can be moved to (owner only; nobody else gets the field).
      api.branchSettings().then((b) => b.branches.map(({ id, name }) => ({ id, name }))).catch(() => []),
    ]);
  } catch (error) {
    /*
     * Jira GRW-478 (U-2) — only a real "no such person" is a 404. A busy or unreachable server was too, so an
     * owner was told their stylist did not exist when the server was having a bad minute.
     */
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    return (
      <div className="page-body">
        <LoadErrorBanner kind={loadErrorKind(error)} />
      </div>
    );
  }

  if (!detail) notFound();
  /*
   * Jira GRW-474 — "same hours as the salon" means this person's branch's hours: that is what the server copies.
   * The business-wide week was shown, so at a branch with its own hours the screen and the saved schedule
   * disagreed. Read after `detail`, which names the branch.
   */
  settings = await api.settings(detail.locationId ?? null).catch(() => null);

  const staffWord = me.labels.providers ?? copy.nav.staff;

  return (
    <StaffEditClient
      detail={detail}
      services={services}
      day={day}
      stats={stats}
      staffWord={staffWord}
      orgWorkingHours={settings?.workingHours ?? []}
      branches={branches.length > 1 ? branches : []}
    />
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Staff member');
