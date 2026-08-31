import { notFound } from 'next/navigation';
import { api } from '../../lib/api';
import { copy } from '../../lib/copy';
import { StaffEditClient } from './StaffEditClient';

export const dynamic = 'force-dynamic';

/**
 * Full-screen staff edit (design Turn 4). Replaces the old right-hand drawer:
 * the form now has room for hours and services side by side with the read-only
 * context an owner needs to judge a change (30-day scorecard, today's
 * remaining bookings) before saving it.
 */
export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail, services, day, stats, me, settings;
  try {
    [me, detail, services, day, stats, settings] = await Promise.all([
      api.me(),
      api.providerDetail(id),
      api.services(),
      api.providerDay(id).catch(() => null),
      api.providerStats(id).catch(() => null),
      api.settings().catch(() => null),
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
    />
  );
}
