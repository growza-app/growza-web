import { rootTitle } from './lib/page-title';
import { DateTime } from 'luxon';
import { api, type Appointment, type AttendanceRegister, type CustomerStats, type HomeOverview, type Me, type ProviderDay } from './lib/api';
import { copy } from './lib/copy';
import { serverLang, type Lang } from './lib/lang';
import { canSeeRevenue, homeKind, type MemberRole } from './lib/nav-policy';
import { OwnerHome } from './components/home/OwnerHome';
import { ReceptionHome } from './components/home/ReceptionHome';
import { StylistHome } from './components/home/StylistHome';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-222 — Home, for whoever signed in.
 *
 * Until this story only the owner had a Home: a stylist and a receptionist were
 * redirected to `/appointments`, because the one Home there was led with the
 * salon's takings and loaded endpoints their roles are refused. Each role now
 * gets its own, and each loads ONLY reads its role already has — which is what
 * keeps a role Home from being a disclosure, not the rendering.
 *
 * ## One failed read is one broken card (BR-12)
 *
 * Every read is caught on its own and handed down as `null`, and the card
 * that needed it shows an error with a retry. The old page wrapped everything
 * in one `Promise.all` and replaced the whole screen with "the API is down"
 * when any single call failed — including the one a role was not allowed.
 * Only `/me` failing still takes the page down, because without it there is no
 * telling whose Home to draw.
 */

const soft = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

function greetingPart(timezone: string, now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = DateTime.fromJSDate(now, { zone: timezone }).hour;
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

function dateLabel(lang: Lang, timezone: string, now: Date): string {
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone }).format(now);
}

/** Active staff on today's roster with no attendance row. Off-today people are not rostered, so they never count. */
function notMarkedIn(register: AttendanceRegister | null): number | null {
  if (!register) return null;
  return register.rows.filter((r) => r.onDate === register.today && r.rostered && r.status === null).length;
}

export default async function DashboardPage() {
  let me: Me;
  try {
    me = await api.me();
  } catch {
    return (
      <div className="page-body">
        <div className="banner">
          <strong>{copy.errors.apiDown}</strong> {copy.errors.apiDownHelp} <code>npm run dev</code>.
        </div>
      </div>
    );
  }

  const lang = await serverLang();
  const role = (me.member?.role as MemberRole | undefined) ?? null;
  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';
  const now = new Date();
  const today = DateTime.fromJSDate(now, { zone: timezone });
  const common = {
    lang,
    labels: me.labels,
    businessName: me.tenant?.name ?? 'Your business',
    timezone,
    nowISO: now.toISOString(),
    dateLabel: dateLabel(lang, timezone, now),
    greetingPart: greetingPart(timezone, now),
  };

  const kind = homeKind(role);

  if (kind === 'stylist') {
    const [appointments, day, attendanceMonth] = await Promise.all([
      soft(api.appointments()),
      soft(api.providerDay()) as Promise<ProviderDay | null>,
      soft(api.attendance(today.startOf('month').toISODate()!, today.toISODate()!)),
    ]);
    // Own takings (GRW-216) stay on the Bookings screen: the design's stylist
    // Home has no money card, and this Home draws the design.
    return <StylistHome {...common} locationName={me.tenant?.locationName ?? null} appointments={appointments} day={day} attendanceMonth={attendanceMonth} />;
  }

  if (kind === 'reception') {
    const [appointments, queue, providers] = await Promise.all([soft(api.appointments()), soft(api.walkInQueue()), soft(api.providers())]);
    return <ReceptionHome {...common} locationName={me.tenant?.locationName ?? null} appointments={appointments} queue={queue} providers={providers ?? []} />;
  }

  // Owner and manager. `canSeeRevenue` is asserted rather than assumed: this is
  // the one Home that shows the takings, and a future role falling into this
  // branch by default should fail loudly here, not quietly show money.
  if (!canSeeRevenue(role)) throw new Error(`Home: role ${role} reached the owner's Home`);

  const [overview, stats, register] = await Promise.all([
    soft(api.home('today')) as Promise<HomeOverview | null>,
    soft(api.customerStats()) as Promise<CustomerStats | null>,
    soft(api.attendance(today.toISODate()!)),
  ]);
  // After closing, the list that matters is tomorrow's (FR-09).
  const listIsTomorrow = overview?.hoursToday.afterClose ?? false;
  const appointments: Appointment[] | null = await soft(api.appointments(listIsTomorrow ? today.plus({ days: 1 }).toISODate()! : undefined));

  return (
    <OwnerHome
      {...common}
      primaryLocationName={me.tenant?.locationName ?? null}
      role={role}
      reportTabs={me.reportTabs}
      whatsappLive={me.whatsapp?.booking ?? false}
      initial={overview}
      appointments={appointments}
      listIsTomorrow={listIsTomorrow}
      customerStats={stats}
      staffNotMarkedIn={notMarkedIn(register)}
    />
  );
}

/**
 * Jira GRW-192 — Home spells its own tab out in full.
 *
 * The layout's `title.template` reaches child segments only, and this page
 * shares a segment with that layout — so it read "Home" while every other tab
 * read "<Screen> · <Business>".
 */
export const generateMetadata = () => rootTitle('Home');
