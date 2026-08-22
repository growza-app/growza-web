import { api, type Appointment, type Provider, type ProviderDay, type TodayStats } from './lib/api';
import { copy } from './lib/copy';
import { SummaryCard } from './components/SummaryCard';
import { DaySchedule } from './components/DaySchedule';
import { StaffCapacity } from './components/StaffCapacity';
import {
  IconAnalytics,
  IconBell,
  IconCalendar,
  IconChevronRight,
  IconPlus,
  IconSearch,
  IconStaff,
  IconUser,
  IconUserPlus,
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

function TopInsight() {
  return (
    <a href="/services" className="rail-insight">
      <span>✦</span>
      <div>
        <strong>Top insight</strong>
        <p>Keep an eye on your most booked service today.</p>
      </div>
      <IconChevronRight />
    </a>
  );
}

/**
 * A real hourly booking count for today (bucketed into four 3-hour windows,
 * matching the reference design), not a fabricated curve — every point comes
 * straight from today's appointments' own start times. Cancelled bookings
 * are excluded (they didn't actually happen in that slot); no-shows count,
 * since the slot was genuinely booked. The trend badge compares against
 * stats.bookingsYesterday, the same figure the summary card's own "vs
 * yesterday" comparisons use elsewhere — no separate fetch needed.
 */
function BookingsChart({ buckets, trendPct }: { buckets: Array<{ label: string; count: number }>; trendPct: number | null }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const w = 280;
  const plotH = 90; // the line/fill area only — value labels live above it, time labels below; sized to match the summary card's height
  const topPad = 16; // headroom so the peak point's value label never clips the card edge
  const stepX = w / (buckets.length - 1);
  const points = buckets.map((b, i) => ({
    x: i * stepX,
    y: topPad + (1 - b.count / max) * (plotH - topPad),
    count: b.count,
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${line} ${w},${plotH} 0,${plotH}`;

  return (
    <section className="rail-card rail-chart">
      <div className="rail-head-row">
        <h3>Bookings today</h3>
        {trendPct !== null && (
          <span className={`rail-trend ${trendPct >= 0 ? 'up' : 'down'}`}>
            {trendPct >= 0 ? '↑' : '↓'} {Math.abs(trendPct)}%
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${plotH + 20}`} width="100%" height={plotH + 20} role="img" aria-label={`Bookings by time of day: ${buckets.map((b) => `${b.count} at ${b.label}`).join(', ')}`}>
        <polygon points={area} className="rail-chart-fill" />
        <polyline points={line} className="rail-chart-line" />
        {points.map((p, i) => (
          <text
            key={`v-${buckets[i]!.label}`}
            x={p.x}
            y={Math.max(p.y - 9, 10)}
            textAnchor={i === 0 ? 'start' : i === buckets.length - 1 ? 'end' : 'middle'}
            className="rail-chart-value"
          >
            {p.count}
          </text>
        ))}
        {points.map((p, i) => (
          <circle key={buckets[i]!.label} cx={p.x} cy={p.y} r="3" className="rail-chart-dot" />
        ))}
        {buckets.map((b, i) => (
          <text key={b.label} x={points[i]!.x} y={plotH + 17} textAnchor={i === 0 ? 'start' : i === buckets.length - 1 ? 'end' : 'middle'} className="rail-chart-label">
            {b.label}
          </text>
        ))}
      </svg>
    </section>
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
  // A combo booking is several appointment ROWS (one per service) sharing one
  // bookingGroupId — counting rows would count that one customer visit 2-3x.
  // Every "how many bookings" figure below counts DISTINCT bookings instead,
  // matching how the Bookings page itself groups combo legs into one row.
  const bookingKey = (a: Appointment) => a.bookingGroupId ?? a.id;
  const countBookings = (list: Appointment[]) => new Set(list.map(bookingKey)).size;

  const newCustomers = countBookings(appointments.filter((appointment) => appointment.customerIsNew));
  const comingUp = countBookings(
    appointments.filter((appointment) => {
      const start = new Date(appointment.startAt).getTime();
      return appointment.status === 'confirmed' && start >= now.getTime() && start <= now.getTime() + 2 * 60 * 60 * 1000;
    }),
  );
  const attention = [
    { label: 'Unconfirmed booking', value: Math.max(stats.bookingsToday - stats.completedToday - comingUp, 0), tone: 'amber', href: '/appointments', icon: <IconBell /> },
    { label: 'Cancellation today', value: countBookings(appointments.filter((appointment) => appointment.status === 'cancelled')), tone: 'rose', href: '/appointments', icon: <IconCalendar /> },
    { label: "Customers haven't visited", value: stats.noShowsThisWeek, tone: 'violet', href: '/customers', icon: <IconStaff /> },
  ];
  // Real, derived-from-today's-appointments numbers — not a fabricated fill.
  // Both a "Total" (the whole day) and an "Upcoming" (only what's still
  // ahead of now) figure are computed here so the widget can toggle between
  // them client-side — "booked minutes" comes straight from each confirmed
  // appointment's own start/end, summed either over the whole day or only
  // the ones still ahead (minutes are correctly leg-based: a 3-service combo
  // really does take the sum of its legs' time). Counts are booking-based.
  // Sorted by the TOTAL figure regardless of which one ends up displayed, so
  // the list doesn't reshuffle when switching.
  const durationMin = (a: Appointment) => (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60_000;
  const staffCapacity = providers
    .map((provider) => {
      // "Total" means the whole day's real workload — completed and no-show
      // bookings genuinely happened/were scheduled, so they count too (only
      // cancelled doesn't, matching the backend's own bookingsToday
      // definition). "Upcoming" narrows to still-pending: confirmed AND not
      // yet started — a completed appointment isn't "in queue" anymore.
      const mine = appointments.filter((a) => a.providerId === provider.id && a.status !== 'cancelled');
      const upcoming = mine.filter((a) => a.status === 'confirmed' && new Date(a.startAt).getTime() >= now.getTime());
      return {
        id: provider.id,
        name: provider.displayName,
        totalCount: countBookings(mine),
        totalBookedMin: mine.reduce((sum, a) => sum + durationMin(a), 0),
        upcomingCount: countBookings(upcoming),
        upcomingBookedMin: upcoming.reduce((sum, a) => sum + durationMin(a), 0),
      };
    })
    .sort((a, b) => b.totalBookedMin - a.totalBookedMin);
  const staffShown = staffCapacity.slice(0, 3);
  const staffHiddenCount = staffCapacity.length - staffShown.length;

  const localHour = (iso: string) =>
    Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso)));
  const BOOKING_WINDOWS: Array<{ label: string; from: number; to: number }> = [
    { label: '9 AM', from: 9, to: 12 },
    { label: '12 PM', from: 12, to: 15 },
    { label: '3 PM', from: 15, to: 18 },
    { label: '6 PM', from: 18, to: 21 },
  ];
  // Bucket by each DISTINCT booking's earliest leg, not every leg
  // independently — otherwise a combo whose legs straddle a window boundary
  // (e.g. starts at 11:45, second service starts at 12:15) would count once
  // in both the 9 AM and 12 PM windows instead of once, in the window it
  // actually started in.
  const firstStartByBooking = new Map<string, string>();
  for (const a of appointments) {
    if (a.status === 'cancelled') continue;
    const key = bookingKey(a);
    const existing = firstStartByBooking.get(key);
    if (!existing || new Date(a.startAt) < new Date(existing)) firstStartByBooking.set(key, a.startAt);
  }
  const bookingStarts = [...firstStartByBooking.values()];
  const bookingBuckets = BOOKING_WINDOWS.map(({ label, from, to }) => ({
    label,
    count: bookingStarts.filter((startAt) => localHour(startAt) >= from && localHour(startAt) < to).length,
  }));
  const bookingTrendPct = stats.bookingsYesterday > 0 ? Math.round(((stats.bookingsToday - stats.bookingsYesterday) / stats.bookingsYesterday) * 100) : null;

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
              <div className="home-section-head"><h2>Needs attention</h2></div>
              <div className="attention-grid">
                {attention.map((item) => (
                  <a className={`attention-card ${item.tone}`} href={item.href} key={item.label}>
                    <span className="attention-top">
                      <span className="attention-icon">{item.icon}</span>
                      <span className="attention-value">{item.value}</span>
                    </span>
                    <span>{item.label}</span>
                    <IconChevronRight />
                  </a>
                ))}
              </div>
            </section>

            <section className="home-section home-upcoming">
              <div className="home-section-head"><h2>Up next</h2><a href="/appointments">See all ({countBookings(appointments)})</a></div>
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

            {/* Same insight card as the desktop rail — shown here only below
                860px, where there's no rail to hold it (see .mobile-only-section).
                "Today at a glance" isn't repeated here: it was a straight
                repeat of the summary card above, so it was dropped everywhere,
                not just on desktop. */}
            <section className="home-section mobile-only-section">
              <TopInsight />
            </section>
          </main>

          <aside className="home-rail desktop-only">
            <BookingsChart buckets={bookingBuckets} trendPct={bookingTrendPct} />
            <QuickActions />
            <StaffCapacity label={me.labels.providers ?? copy.nav.staff} staff={staffShown} hiddenCount={staffHiddenCount} />
            <TopInsight />
          </aside>
        </div>
      </div>
    </>
  );
}
