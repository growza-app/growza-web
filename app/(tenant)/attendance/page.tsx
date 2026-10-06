import { screenTitle } from '../lib/page-title';
import { guardLive } from '../lib/screen-guard';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { PageHeader } from '../components/PageHeader';
import { AttendanceRegister } from './AttendanceRegister';
import { mayUse } from '../lib/nav-policy';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-63 · GRW-170 — who was here.
 *
 * A register the owner, a manager or the receptionist fills in. Deliberately
 * not a time clock: nothing observes anybody, and nothing here reaches
 * availability — an unmarked day leaves a gap in this report, never a closed
 * calendar.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  // Jira GRW-556 — this screen opens at go-live; before it, say so rather than draw what the API would refuse.
  await guardLive('/attendance');
  const params = await searchParams;
  const t = await getTranslations('attendance');

  /**
   * Jira GRW-63 · GRW-200 — a stylist has no register to fill in, only a
   * record to read. They are sent to their own month rather than shown an
   * empty marking screen; the API scopes that page to them regardless.
   */
  const viewer = await api.me().catch(() => null);
  // Jira GRW-409 — "may not mark the register", asked of the shared rule rather than `role === 'staff'`.
  if (viewer?.member && !mayUse(viewer.member.role, 'attendance.mark') && viewer.member.providerId) {
    redirect(`/attendance/${viewer.member.providerId}`);
  }

  let me, register;
  try {
    [me, register] = await Promise.all([api.me(), api.attendance(params.date ?? todayFallback())]);
  } catch (error) {
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  return (
    <>
      {/* The mock draws its own page title and strapline INSIDE the body, under
          a header bar this shell already provides. Kept there (att-head), so
          the design's heading is not printed twice. */}
      <PageHeader title={t('title')} />
      <AttendanceRegister
        initial={register}
        staffWord={me.labels.providers ?? copy.nav.staff}
        /*
         * Jira GRW-249 — the branch picker, owner-only, same restriction
         * Reports draws (GRW-238): a manager or receptionist never gets to
         * pick, and a single-branch business never sees the control at all
         * (BR-01).
         */
        branches={(me.member?.role ?? 'owner') === 'owner' && (me.branches?.length ?? 0) > 1 ? me.branches! : []}
      />
    </>
  );
}

/**
 * The server's own date is only a first guess — the API resolves the real
 * "today" in the tenant's timezone and hands it back, and the client uses
 * that. Sending a UTC date from a machine in another zone would open the
 * register on yesterday.
 */
function todayFallback(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Attendance');
