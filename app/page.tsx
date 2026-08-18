import { api, formatMoney, formatTime, type Appointment, type ProviderDay, type TodayStats } from './lib/api';
import { copy } from './lib/copy';
import { PageHeader } from './components/PageHeader';

export const dynamic = 'force-dynamic';

const initials = (name: string | null) =>
  (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function statusChip(appt: Appointment) {
  if (appt.status === 'completed') return { cls: 'chip-completed', text: copy.status.done };
  if (appt.status === 'no_show') return { cls: 'chip-no_show', text: copy.status.didNotCome };
  if (appt.status === 'cancelled') return { cls: 'chip-cancelled', text: copy.status.cancelled };
  // A confirmed booking whose reminder already went out shows that instead —
  // a derived display state, never a DB status (07-product-surfaces.md §1.2).
  if (appt.reminderSent) return { cls: 'chip-reminder', text: copy.status.reminded };
  if (appt.createdVia === 'dashboard') return { cls: 'chip-new', text: copy.status.walkIn };
  return { cls: 'chip-confirmed', text: copy.status.confirmed };
}

function KpiTiles({ stats, labels }: { stats: TodayStats; labels: Record<string, string> }) {
  const utilisation =
    stats.capacityMinutesToday > 0 ? Math.round((stats.bookedMinutesToday / stats.capacityMinutesToday) * 100) : 0;
  const hoursFree = Math.round(Math.max(stats.capacityMinutesToday - stats.bookedMinutesToday, 0) / 60);

  const bookingDiff = stats.bookingsToday - stats.bookingsYesterday;
  const missedDiff = stats.noShowsThisWeek - stats.noShowsPrevWeek;

  const revenueToday = Number(stats.revenueTodayMinor);
  const revenuePrev = Number(stats.revenuePrevWeekSameDayMinor);
  const revenuePct = revenuePrev > 0 ? Math.round(((revenueToday - revenuePrev) / revenuePrev) * 100) : null;

  return (
    <div className="tiles">
      <div className="tile">
        <div className="label">{copy.kpi.bookingsToday}</div>
        <div className="value">{stats.bookingsToday}</div>
        <div className={`delta ${bookingDiff > 0 ? 'delta-up' : bookingDiff < 0 ? 'delta-bad' : ''}`}>
          {bookingDiff === 0
            ? copy.kpi.sameAsYesterday
            : bookingDiff > 0
              ? copy.kpi.moreThanYesterday(bookingDiff)
              : copy.kpi.fewerThanYesterday(Math.abs(bookingDiff))}
        </div>
      </div>

      <div className="tile">
        <div className="label">{copy.kpi.missedThisWeek}</div>
        <div className="value">{stats.noShowsThisWeek}</div>
        {/* Fewer people missing appointments is good news — colour it that way. */}
        <div className={`delta ${missedDiff < 0 ? 'delta-up' : missedDiff > 0 ? 'delta-bad' : ''}`}>
          {missedDiff === 0
            ? copy.kpi.sameAsLastWeek
            : missedDiff < 0
              ? copy.kpi.fewerThanLastWeek(Math.abs(missedDiff))
              : copy.kpi.moreThanLastWeek(missedDiff)}
        </div>
      </div>

      <div className="tile">
        <div className="label">{copy.kpi.earnedToday}</div>
        <div className="value">{formatMoney(stats.revenueTodayMinor)}</div>
        <div className={`delta ${revenuePct !== null && revenuePct >= 0 ? 'delta-up' : revenuePct !== null ? 'delta-bad' : ''}`}>
          {revenuePct === null
            ? copy.kpi.noComparison
            : revenuePct >= 0
              ? copy.kpi.upFromLastWeek(revenuePct)
              : copy.kpi.downFromLastWeek(Math.abs(revenuePct))}
        </div>
      </div>

      <div className="tile">
        <div className="label">{labels.utilisation_kpi ?? 'How busy today'}</div>
        <div className="value">{utilisation}%</div>
        <div className="delta">{copy.kpi.hoursFree(hoursFree)}</div>
      </div>
    </div>
  );
}

function ChairTimeline({ day }: { day: ProviderDay }) {
  const hours = Array.from({ length: 11 }, (_, i) => 9 + i); // 09:00 – 19:00

  const localHour = (iso: string) =>
    Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: day.timezone }).format(new Date(iso)));

  const entryAt = (hour: number) =>
    day.entries.find((e) => {
      const start = localHour(e.startAt);
      const end = localHour(e.endAt);
      return hour >= start && hour < Math.max(end, start + 1);
    });

  const blockClass = (hour: number) => {
    if (hour < 12) return 'tl-booking';
    if (hour < 16) return 'tl-booking-alt';
    return 'tl-booking-late';
  };

  return (
    <div className="timeline">
      {hours.map((hour) => {
        const entry = entryAt(hour);
        const label = `${hour > 12 ? hour - 12 : hour}:00`;
        return (
          <div className="tl-row" key={hour}>
            <div className="tl-hour">{label}</div>
            <div className="tl-track">
              {!entry ? (
                <span className="tl-open">{copy.today.free}</span>
              ) : entry.kind === 'block' ? (
                <span className="tl-lunch">{entry.label.toLowerCase()}</span>
              ) : (
                <div className={`tl-block ${blockClass(hour)}`}>{entry.label}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function DashboardPage() {
  let stats: TodayStats, appointments: Appointment[], me, providerDay: ProviderDay | null = null;

  try {
    [stats, appointments, me] = await Promise.all([api.todayStats(), api.appointments(), api.me()]);
    providerDay = await api.providerDay().catch(() => null);
  } catch {
    return (
      <>
        <PageHeader title={copy.nav.dashboard} />
        <div className="page-body">
          <div className="banner">
            <strong>{copy.errors.apiDown}</strong> {copy.errors.apiDownHelp} <code>npm run dev</code>.
          </div>
        </div>
      </>
    );
  }

  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateLine = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(new Date());

  const bookingsWord = me.labels.appointments ?? 'Bookings';

  return (
    <>
      <PageHeader
        title={`${greeting} 👋`}
        subtitle={`${dateLine} · ${me.tenant?.locationName ?? ''}`}
        initial={(me.tenant?.name ?? 'S').charAt(0).toUpperCase()}
      />

      <div className="page-body">
        <KpiTiles stats={stats} labels={me.labels} />

        <div className="grid-2">
          <div className="card">
            <div className="card-head">
              <span>{copy.today.heading(bookingsWord)}</span>
              <a className="link" href="/appointments">
                {copy.today.viewAll}
              </a>
            </div>
            {appointments.length === 0 ? (
              <div className="empty">{copy.today.nothing}</div>
            ) : (
              appointments.map((appt) => {
                const chip = statusChip(appt);
                return (
                  <div className="appt" key={appt.id}>
                    <div className="appt-time">{formatTime(appt.startAt, timezone)}</div>
                    <div className="avatar">{initials(appt.customerName)}</div>
                    <div className="appt-main">
                      <div className="appt-name">{appt.customerName ?? 'Unknown'}</div>
                      <div className="appt-sub">
                        {appt.serviceName}
                        {appt.providerName ? ` · ${appt.providerName}` : ''}
                      </div>
                    </div>
                    <span className={`chip ${chip.cls}`}>{chip.text}</span>
                  </div>
                );
              })
            )}
          </div>

          {providerDay && (
            <div className="card">
              <div className="card-head">
                <span>{copy.today.chairToday(providerDay.provider.displayName, me.labels.resource ?? 'chair')}</span>
              </div>
              <ChairTimeline day={providerDay} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
