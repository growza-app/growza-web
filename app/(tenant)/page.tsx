import { rootTitle } from './lib/page-title';
import { DateTime } from 'luxon';
import { api, type Appointment, type AttendanceRegister, type CustomerStats, type HomeOverview, type Me, type ProviderDay } from './lib/api';
import { LoadErrorBanner } from './components/LoadErrorBanner';
import { loadErrorKind } from './lib/load-error';
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

/**
 * "Sun, 13 Sep" — the design's date. Jira GRW-225: `en-IN` spells September
 * "Sept", so the English label is assembled from parts with a three-letter month.
 */
function dateLabel(lang: Lang, timezone: string, now: Date): string {
  if (lang === 'hi') return new Intl.DateTimeFormat('hi-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone }).format(now);
  const part = (type: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone }).formatToParts(now).find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')} ${part('month').slice(0, 3)}`;
}

/**
 * Active staff on today's roster with no attendance row. Off-today people are not rostered, so they never count.
 * Jira GRW-477 — who, not how many: Home narrows them to its branch in the browser, as it does everything else.
 */
function notMarkedIn(register: AttendanceRegister | null): string[] | null {
  if (!register) return null;
  return register.rows.filter((r) => r.onDate === register.today && r.rostered && r.status === null).map((r) => r.providerId);
}

export default async function DashboardPage() {
  let me: Me;
  try {
    me = await api.me();
  } catch (error) {
    return (
      <div className="page-body">
        <LoadErrorBanner kind={loadErrorKind(error)} />
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
    // Jira GRW-251 — a stylist at a branch sees that branch, its closing time, and whether it was closed.
    return (
      <StylistHome
        {...common}
        locationName={me.member?.locationName ?? me.tenant?.locationName ?? null}
        branch={me.member?.locationName ? { closed: me.member.locationClosed ?? false, closesAt: me.member.locationClosesAt ?? null, openToday: me.member.locationOpenToday ?? null } : null}
        appointments={appointments}
        day={day}
        attendanceMonth={attendanceMonth}
      />
    );
  }

  if (kind === 'reception') {
    // Jira GRW-404 — the day's tokens are the desk's Home (a pinned desk is sent its own branch's only).
    const [appointments, board, providers] = await Promise.all([soft(api.appointments()), soft(api.tokensToday()), soft(api.providers())]);
    // Jira GRW-237 — a receptionist with a branch sees that branch's name, not the main one's.
    return <ReceptionHome {...common} locationName={me.member?.locationName ?? me.tenant?.locationName ?? null} appointments={appointments} board={board} providers={providers ?? []} />;
  }

  // Owner and manager. `canSeeRevenue` is asserted rather than assumed: this is
  // the one Home that shows the takings, and a future role falling into this
  // branch by default should fail loudly here, not quietly show money.
  if (!canSeeRevenue(role)) throw new Error(`Home: role ${role} reached the owner's Home`);

  /*
   * Jira GRW-351 — everything the whole business has; Home narrows it to the branch it shows, which it only learns
   * in the browser (the pick is kept there).
   *
   * - The walk-in queue, for Right now.
   * - Today's visits AND tomorrow's, always. After closing the list that matters is tomorrow's (FR-09), but whether
   *   the branch Home shows has closed is decided by that branch's hours — and a branch may close before the
   *   business does. Right now still needs today's after closing: a visit running over at closing time stays an
   *   alert until it hands over to "Not marked done yet".
   */
  /*
   * Jira GRW-418 — the board and the staff to give a token to, same two reads the desk's Home makes.
   *
   * An owner who is their own front desk had nowhere to see who was waiting: the board is the receptionist
   * Home's, and `Right now` — the only place the queue reached an owner — is a count, and is hidden outright
   * below 1101px. So the owner's Home loads what the desk's does and shows the same board when somebody is
   * in fact waiting.
   */
  const [overview, stats, register, queue, appointments, tomorrowAppointments, board, providers] = await Promise.all([
    soft(api.home('today')) as Promise<HomeOverview | null>,
    soft(api.customerStats()) as Promise<CustomerStats | null>,
    soft(api.attendance(today.toISODate()!)),
    soft(api.walkInQueue()),
    soft(api.appointments()) as Promise<Appointment[] | null>,
    soft(api.appointments(today.plus({ days: 1 }).toISODate()!)) as Promise<Appointment[] | null>,
    soft(api.tokensToday()),
    soft(api.providers()),
  ]);

  return (
    <OwnerHome
      {...common}
      primaryLocationName={me.tenant?.locationName ?? null}
      role={role}
      reportTabs={me.reportTabs}
      whatsappLive={me.whatsapp?.booking ?? false}
      whatsappDemo={me.whatsapp?.demo ?? false}
      initial={overview}
      appointments={appointments}
      board={board}
      providers={providers ?? []}
      tomorrowAppointments={tomorrowAppointments}
      customerStats={stats}
      staffNotMarkedIn={notMarkedIn(register)}
      autopayRenewal={me.autopayRenewal ?? null}
      canPayOnline={me.payments?.online ?? false}
      queue={queue}
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
