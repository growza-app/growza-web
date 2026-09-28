import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { PageHeader } from '../../components/PageHeader';
import { AttendanceMonth } from './AttendanceMonth';
import { monthBounds, monthOf } from './month';
import { mayUse } from '../../lib/nav-policy';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-63 · GRW-200 — one person's attendance, a month at a time.
 *
 * Reached by tapping somebody on the register, and it is also where a stylist
 * lands: they may READ their own record, and the API scopes this to them
 * whatever id is in the URL — so a stylist following a colleague's link sees
 * their own month rather than a 403 they would have to interpret.
 */
export default async function AttendanceMonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ providerId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { providerId } = await params;
  const { month } = await searchParams;
  const t = await getTranslations('attendance');

  let me, register;
  try {
    me = await api.me();
    const tz = me.tenant?.timezone ?? 'Asia/Kolkata';
    const { from, to } = monthBounds(monthOf(month, tz), tz);
    register = await api.attendance(from, to, providerId);
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

  // Jira GRW-409 — read-only for a role the register's writes refuse (a stylist, GRW-200), asked of the shared rule.
  const isOwnRecord = !mayUse(me.member?.role, 'attendance.mark');

  return (
    <>
      <PageHeader title={t('title')} />
      <AttendanceMonth
        register={register}
        month={monthOf(month, register.timezone)}
        /** A stylist reads their own and marks nothing — the API refuses the writes either way. */
        readOnly={isOwnRecord}
        backHref={isOwnRecord ? null : '/attendance'}
      />
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Attendance');
