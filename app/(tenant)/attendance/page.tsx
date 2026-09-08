import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { AttendanceRegister } from './AttendanceRegister';

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
  const params = await searchParams;

  let me, register;
  try {
    [me, register] = await Promise.all([api.me(), api.attendance(params.date ?? todayFallback())]);
  } catch {
    return (
      <>
        <PageHeader title="Attendance" />
        <div className="page-body">
          <div className="banner">
            <strong>{copy.errors.apiDown}</strong> {copy.errors.apiDownHelp} <code>npm run dev</code>.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Who came in, and when they left."
        mobileSubtitle
        initial={(me.tenant?.name ?? 'S').charAt(0).toUpperCase()}
      />
      <AttendanceRegister
        initial={register}
        staffWord={me.labels.providers ?? copy.nav.staff}
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
