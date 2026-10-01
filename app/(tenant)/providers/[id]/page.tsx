import { screenTitle } from '../../lib/page-title';
import { notFound } from 'next/navigation';
import { api } from '../../lib/api';
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
      api.settings().catch(() => null),
      // Jira GRW-234 — where this person can be moved to (owner only; nobody else gets the field).
      api.branchSettings().then((b) => b.branches.map(({ id, name }) => ({ id, name }))).catch(() => []),
    ]);
  } catch {
    notFound();
  }

  if (!detail) notFound();

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
