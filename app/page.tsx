import { api, formatMoney, type Appointment, type Provider, type ProviderDay, type TodayStats } from './lib/api';
import { copy } from './lib/copy';
import { SummaryCard } from './components/SummaryCard';
import { DaySchedule } from './components/DaySchedule';
import { StaffCapacity } from './components/StaffCapacity';
import {
  IconAnalytics,
  IconAppointments,
  IconBell,
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconPlus,
  IconSearch,
  IconStaff,
  IconUser,
  IconUserPlus,
  IconWallet,
} from './components/icons';

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

/**
 * Desktop-only: the floating "+" button covers this same ground on mobile
 * (walk-in / book for later), but has no desktop equivalent — without this,
 * starting a booking from Home meant a detour through the sidebar. Every
 * action here is vertical-agnostic (a salon walk-in and a garage walk-in are
 * the same underlying flow) and links to a route that actually exists —
 * "View reports" points at Bookings, the same placeholder the "View report"
 * glance row already uses, since there's no dedicated reports page yet.
 */
function QuickActions() {
  return (
    <section className="rail-card rail-actions">
      <h3>Quick actions</h3>
      <a className="quick-action quick-action-primary" href="/availability?intent=book">
        <IconPlus />
        New booking
      </a>
      <a className="quick-action" href="/availability?intent=book">
        <IconUserPlus />
        Add walk-in
      </a>
      <a className="quick-action" href="/customers?add=1">
        <IconUser />
        New client
      </a>
      <a className="quick-action" href="/appointments">
        <IconAnalytics />
        View reports
      </a>
    </section>
  );
}

/** "Today at a glance" rows + the insight card — shown on the desktop rail AND, separately, in its own mobile section, so both stay in sync from one definition. */
function GlanceAndInsight({ stats, newCustomers, comingUp }: { stats: TodayStats; newCustomers: number; comingUp: number }) {
  return (
    <>
      <section className="rail-card">
        <h3>Today at a glance</h3>
        <a className="glance-row" href="/appointments">
          <IconAppointments />
          <strong>{stats.bookingsToday}</strong>
          <span>Bookings</span>
          <em>View all</em>
        </a>
        <a className="glance-row" href="/appointments">
          <IconWallet />
          <strong>{formatMoney(stats.revenueTodayMinor)}</strong>
          <span>Revenue</span>
          <em>View report</em>
        </a>
        <a className="glance-row" href="/customers">
          <IconUserPlus />
          <strong>{newCustomers}</strong>
          <span>New customers</span>
          <em>View all</em>
        </a>
        <a className="glance-row" href="/appointments">
          <IconCheck />
          <strong>{comingUp}</strong>
          <span>Coming up</span>
          <em>Next 2 hours</em>
        </a>
      </section>
      <a href="/services" className="rail-insight">
        <span>✦</span>
        <div>
          <strong>Top insight</strong>
          <p>Keep an eye on your most booked service today.</p>
        </div>
        <IconChevronRight />
      </a>
    </>
  );
}

export default async function DashboardPage() {
  let stats: TodayStats, appointments: Appointment[], me, providers: Provider[], providerDay: ProviderDay | null = null;

  try {
    [stats, appointments, me, providers] = await Promise.all([
      api.todayStats(),
      api.appointments(),
      api.me(),
      api.providers(),
    ]);
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
  const newCustomers = appointments.filter((appointment) => appointment.customerIsNew).length;
  const comingUp = appointments.filter((appointment) => {
    const start = new Date(appointment.startAt).getTime();
    return appointment.status === 'confirmed' && start >= now.getTime() && start <= now.getTime() + 2 * 60 * 60 * 1000;
  }).length;
  const attention = [
    { label: 'Unconfirmed booking', value: Math.max(stats.bookingsToday - stats.completedToday - comingUp, 0), tone: 'amber', href: '/appointments', icon: <IconBell /> },
    { label: 'Cancellation today', value: appointments.filter((appointment) => appointment.status === 'cancelled').length, tone: 'rose', href: '/appointments', icon: <IconCalendar /> },
    { label: "Customers haven't visited", value: stats.noShowsThisWeek, tone: 'violet', href: '/customers', icon: <IconStaff /> },
  ];
  // Real, derived-from-today's-appointments numbers — not a fabricated fill.
  // Both a "Total" (the whole day) and an "Upcoming" (only what's still
  // ahead of now) figure are computed here so the widget can toggle between
  // them client-side — "booked minutes" comes straight from each confirmed
  // appointment's own start/end, summed either over the whole day or only
  // the ones still ahead. Sorted by the TOTAL figure regardless of which
  // one ends up displayed, so the list doesn't reshuffle when switching.
  const durationMin = (a: Appointment) => (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60_000;
  const staffCapacity = providers
    .map((provider) => {
      const mine = appointments.filter((a) => a.providerId === provider.id && a.status === 'confirmed');
      const upcoming = mine.filter((a) => new Date(a.startAt).getTime() >= now.getTime());
      return {
        id: provider.id,
        name: provider.displayName,
        totalCount: mine.length,
        totalBookedMin: mine.reduce((sum, a) => sum + durationMin(a), 0),
        upcomingCount: upcoming.length,
        upcomingBookedMin: upcoming.reduce((sum, a) => sum + durationMin(a), 0),
      };
    })
    .sort((a, b) => b.totalBookedMin - a.totalBookedMin);
  const staffShown = staffCapacity.slice(0, 3);
  const staffHiddenCount = staffCapacity.length - staffShown.length;

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
        <a className="home-search desktop-home-search" href="/search" aria-label={copy.search.title}>
          <IconSearch />
          <span>Search anything...</span>
        </a>
        <a className="icon-btn mobile-home-search" href="/search" aria-label={copy.search.title}><IconSearch /></a>
        <button className="home-bell desktop-only" type="button" aria-label="Notifications">●</button>
        <div className="avatar-lg" style={{ width: 36, height: 36, fontSize: 14 }}>
          {(me.tenant?.name ?? 'S').charAt(0).toUpperCase()}
        </div>
      </header>

      <div className="page-body home-page">
        <div className="home-layout">
          <main className="home-main">
            <SummaryCard stats={stats} newCustomers={newCustomers} />

            <section className="home-section">
              <div className="home-section-head"><h2>Needs attention</h2><a href="/appointments">View all (3)</a></div>
              <div className="attention-grid">
                {attention.map((item) => <a className={`attention-card ${item.tone}`} href={item.href} key={item.label}><span className="attention-icon">{item.icon}</span><span className="attention-value">{item.value}</span><span>{item.label}</span><IconChevronRight /></a>)}
              </div>
            </section>

            <section className="home-section home-upcoming">
              <div className="home-section-head"><h2>Up next</h2><a href="/appointments">See all ({appointments.length})</a></div>
              <DaySchedule appointments={appointments} timezone={timezone} nowISO={now.toISOString()} />
            </section>

            {providerDay && (
              <div className="card desktop-only home-chair" style={{ marginTop: 18 }}>
            <div className="card-head">
              <span>{copy.today.chairToday(providerDay.provider.displayName, me.labels.resource ?? 'chair')}</span>
            </div>
            <ChairTimeline day={providerDay} />
              </div>
            )}

            {/* Same glance rows + insight as the desktop rail — shown here only below
                860px, where there's no rail to hold them (see .mobile-only-section). */}
            <section className="home-section mobile-only-section">
              <GlanceAndInsight stats={stats} newCustomers={newCustomers} comingUp={comingUp} />
            </section>
          </main>

          <aside className="home-rail desktop-only">
            <QuickActions />
            <StaffCapacity label={me.labels.providers ?? copy.nav.staff} staff={staffShown} hiddenCount={staffHiddenCount} />
            <GlanceAndInsight stats={stats} newCustomers={newCustomers} comingUp={comingUp} />
          </aside>
        </div>
      </div>
    </>
  );
}
