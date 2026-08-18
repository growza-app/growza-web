import { api, type Appointment, type ProviderDay, type TodayStats } from './lib/api';
import { copy } from './lib/copy';
import { SummaryCard } from './components/SummaryCard';
import { DaySchedule } from './components/DaySchedule';
import { IconSearch } from './components/icons';

export const dynamic = 'force-dynamic';

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
      <div className="page-body">
        <div className="banner">
          <strong>{copy.errors.apiDown}</strong> {copy.errors.apiDownHelp} <code>npm run dev</code>.
        </div>
      </div>
    );
  }

  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone }).format(now));
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const dateLine = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(now);

  return (
    <>
      <header className="home-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="home-greeting">{copy.home.greeting(part)}</div>
          <div className="home-sub">
            {me.tenant?.name ?? 'Your salon'} · {dateLine}
            {me.tenant?.locationName ? ` · ${me.tenant.locationName}` : ''}
          </div>
        </div>
        <a className="icon-btn" href="/search" aria-label={copy.search.title}>
          <IconSearch />
        </a>
        <div className="avatar-lg" style={{ width: 36, height: 36, fontSize: 14 }}>
          {(me.tenant?.name ?? 'S').charAt(0).toUpperCase()}
        </div>
      </header>

      <div className="page-body">
        <SummaryCard stats={stats} />

        <div className="card-head" style={{ padding: '0 2px 9px', border: 'none' }}>
          <span style={{ fontWeight: 620 }}>{copy.home.scheduleTitle}</span>
          <a className="link" href="/appointments">
            {copy.home.seeAll} →
          </a>
        </div>

        <DaySchedule appointments={appointments} timezone={timezone} nowISO={now.toISOString()} />

        {providerDay && (
          <div className="card desktop-only" style={{ marginTop: 18 }}>
            <div className="card-head">
              <span>{copy.today.chairToday(providerDay.provider.displayName, me.labels.resource ?? 'chair')}</span>
            </div>
            <ChairTimeline day={providerDay} />
          </div>
        )}
      </div>
    </>
  );
}
