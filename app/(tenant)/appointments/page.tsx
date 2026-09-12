import { labelledTitle, TITLE_FALLBACK } from '../lib/page-title';
import { api, type Appointment } from '../lib/api';
import { formatDateShort, formatDateWithWeekday } from '../lib/format';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { BookingsList } from './BookingsList';

export const dynamic = 'force-dynamic';

/** The full "Bookings" list — a date range (the API is a day-range query, same as the dashboard's "today" list), narrowed client-side by search/staff/status. */
// Just the valid values: this only guards ?status= against a junk param. It
// used to carry display labels too, which was a second place for this
// wording to drift out of step with copy.status — the Status control renders
// its own labels from there.
const STATUSES = new Set(['cancelled', 'completed', 'confirmed', 'no_show']);

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    to?: string;
    status?: string;
    q?: string;
    staff?: string;
    sort?: string;
    customerId?: string;
  }>;
}) {
  const params = await searchParams;
  // Deep-linked from Home's "Cancellation today" card (?status=cancelled) —
  // validated against the real statuses so a stray query param is ignored
  // rather than silently filtering everything out.
  const status = params.status && STATUSES.has(params.status) ? params.status : '';
  // The search/staff/status/sort controls are client-side, but the date form
  // is a real GET submit — so pressing Show reloads the page and would drop
  // them back to their defaults. BookingsList round-trips them through the
  // URL (hidden inputs) and they are re-seeded here, so a submit preserves
  // what the owner had set instead of silently resetting it.
  const sort = params.sort === 'desc' ? 'desc' : 'asc';
  const query = params.q ?? '';

  let me, providers;
  try {
    [me, providers] = await Promise.all([api.me(), api.providers()]);
  } catch (error) {
    /*
     * Jira GRW-220 — say what happened, somewhere.
     *
     * This was a bare `catch {}`. The owner got "Cannot reach the server" and
     * the cause went nowhere at all: not to a log, not to a correlation id,
     * not to disk. Support would have had a screenshot and nothing else.
     *
     * `console.error` on purpose rather than the pino logger — this runs in
     * the Next SERVER process, which does not have the API's logger, and its
     * stdout is the deployable's log stream either way (08 §3).
     *
     * Found by the device sweep: eight viewports failed on this banner while
     * the API was answering every request in four milliseconds and neither
     * process wrote a single line about it. A failure nobody records is a
     * failure nobody can fix.
     */
    console.error('[bookings] could not load the page shell', error);
    return (
      <>
        <PageHeader title={copy.nav.appointments} />
        <div className="page-body">
          <div className="banner">
            <strong>{copy.errors.apiDown}</strong> {copy.errors.apiDownHelp} <code>npm run dev</code>.
          </div>
        </div>
      </>
    );
  }

  // Validated against the real roster: a stale ?staff= from an edited URL or
  // a since-removed stylist would otherwise match nothing and read as "this
  // day is empty" rather than "that filter no longer applies".
  const staff = params.staff && providers.some((p) => p.displayName === params.staff) ? params.staff : 'Everyone';

  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

  /**
   * Arriving from a client's card, to see that client's bookings.
   *
   * The date filter has to stand down for it. This screen defaults to today,
   * so "See bookings" for someone whose last visit was in July used to land on
   * an empty day — the button worked, the page just had nothing to show. When
   * a client is named, the window opens wide and the query narrows to them
   * instead (indexed since migration 0001), so the range costs nothing.
   */
  // Shape-checked before it goes near the query: the column is a uuid, so
  // "?customerId=abc" would be a cast error rather than an empty result.
  const customerIdParam = params.customerId?.trim();
  const customerId =
    customerIdParam && /^[0-9a-f-]{36}$/i.test(customerIdParam) ? customerIdParam : undefined;
  // Sentinels, not dates. They are the query window only — never shown, and
  // never fed back into the From/To fields, which stay empty so the owner can
  // still narrow a client's history by date if they want to.
  const ALL_TIME_FROM = '2000-01-01';
  const ALL_TIME_TO = '2099-12-31';
  const fieldFrom = params.date ?? (customerId ? '' : todayISO);
  // GRW-47: the filter is a From/To range now. `to` defaults to `date`, so
  // the common case is still exactly one day and every "today" label below
  // keeps meaning what it did; a `to` earlier than `date` is ignored by the
  // API rather than returning nothing.
  const fieldTo = params.to && fieldFrom && params.to >= fieldFrom ? params.to : fieldFrom;
  const date = fieldFrom || ALL_TIME_FROM;
  const toDate = fieldTo || ALL_TIME_TO;
  const isRange = toDate !== date;
  // True only while the whole history is on screen. Once a date is picked the
  // page is a normal filtered range again that happens to be one client's.
  const wholeHistory = Boolean(customerId) && !fieldFrom;

  // GRW-47: no `providerId` — staff filtering now lives entirely client-side
  // in BookingsList (search + staff select on desktop, chips on mobile),
  // so the server always loads the full range rather than a server-narrowed
  // slice that a client-side filter could contradict.
  // Status is NOT filtered here any more: it seeds BookingsList's own Status
  // control instead, so there is one filtering mechanism rather than a
  // server-side pass and a client-side control that can disagree. The KPI row
  // therefore keeps showing the day's real totals while the list narrows —
  // the same split search and the staff filter already use.
  /*
   * Jira GRW-216 — a stylist's own takings, when the owner has turned that on
   * for them.
   *
   * `.catch(() => null)` because the route 403s for a salaried stylist and 404s
   * for an owner, and neither is an error worth a broken page: both simply mean
   * "there is nothing of this kind to show you". The difference between 403 and
   * zero earnings still matters to the person reading it, which is why the
   * route refuses rather than answering zero — the card is just absent, not
   * showing a zero that would look like unrecorded work.
   */
  /**
   * Jira GRW-220 — a failed fetch is recorded, never disguised as an empty day.
   *
   * This was `.catch(() => [])`, and an empty array is indistinguishable from a
   * day with no bookings: the screen drew "No bookings that day." and four zero
   * KPIs. For an owner on a busy Saturday that is not a degraded experience, it
   * is a false statement about their business — and the one they would act on,
   * by going to look for what went wrong at the desk.
   *
   * Found by the device sweep, which flaked on ten viewports for exactly this
   * reason: under two parallel browsers the fetch occasionally lost, the page
   * rendered an honest-looking empty state, and the spec could not tell that
   * from a real layout fault. A screen that lies to a person lies to a test
   * too.
   */
  const [appointmentsResult, capacity, earnings] = await Promise.all([
    api
      .appointments(date, toDate, undefined, customerId)
      .then((rows) => ({ rows, failed: false }))
      .catch(() => ({ rows: [] as Appointment[], failed: true })),
    /**
     * Jira GRW-63 · GRW-168 — the busy figure's denominator, from the same
     * `working_hours` rows the availability engine books against, over exactly
     * the range being shown. It used to be `roster size × an assumed nine-hour
     * day`, computed here in the browser; every tenant sets its own schedule
     * and a stylist may override theirs, so the assumption was wrong for most
     * salons and wrong by a different amount for each person in them.
     *
     * A failure yields no capacity, and the card shows no percentage rather
     * than falling back to a number nobody can account for.
     */
    api.capacity(date, toDate).catch(() => null),
    api.myEarnings().catch(() => null),
  ]);
  const appointments = appointmentsResult.rows;
  const bookingsWord = me.labels.appointments ?? copy.nav.appointments;
  // A multi-day range is never "today", even when it starts today — the
  // headline labels ("Today", "Next 2 hrs") would be lying about the rest.
  const isToday = !isRange && date === todayISO && !customerId;
  // Whose bookings these are, for the banner. Taken from the rows rather than
  // the URL so it is the name actually on the bookings, not one a link claimed.
  const customerName = customerId ? (appointments[0]?.customerName ?? null) : null;
  // A window spanning the year 2000 to 2099 is a mechanism, not a date range,
  // and labelling it as one would be a screen describing itself falsely. When
  // a client is named, the labels say so instead.
  const dayHint = wholeHistory
    ? `Every booking for ${customerName ?? 'this client'}`
    : formatDateWithWeekday(new Date(`${date}T12:00:00`), timezone);
  // Short form for the KPI/schedule labels when a non-today date is picked, e.g. "21 Aug" — or "21 Aug – 24 Aug" for a range.
  const dayShort = wholeHistory
    ? (customerName ?? 'This client')
    : isRange
      ? `${formatDateShort(new Date(`${date}T12:00:00`))} – ${formatDateShort(new Date(`${toDate}T12:00:00`))}`
      : formatDateShort(new Date(`${date}T12:00:00`));
  return (
    <>
      {/* No search action in the header: this page has its own search field
          in the filter card now (GRW-47), and a second magnifier pointing at
          the global /search page right above it read as the same control. */}
      <PageHeader
        title={bookingsWord}
        subtitle="All your appointments in one place."
        mobileSubtitle
      />

      <div className="page-body bk-fit">
        {/* Says whose bookings these are and how to get back out. Without it a
            page showing one client's history is indistinguishable from a very
            quiet day, and the date picker below would look broken rather than
            deliberately stood down. */}
        {customerId && (
          <div className="bk-client-banner">
            <span>
              {wholeHistory ? 'Showing every booking for ' : 'Showing bookings for '}
              <strong>{customerName ?? 'this client'}</strong>
              {appointments.length === 0 &&
                (wholeHistory ? ' — they have none yet' : ' — none in these dates')}
            </span>
            <a className="btn btn-ghost btn-sm" href="/appointments">
              Show all bookings
            </a>
          </div>
        )}
        {/* The "Showing Cancelled only" banner is gone: the Status control in
            the filter card shows the same thing, in the place you'd change
            it. A banner plus a control is two ways to read one filter. */}

        {/* GRW-47: the day-filter form itself now renders inside BookingsList,
            in one combined card with search/staff/Filters (desktop) — folded
            in so the desktop mock's single filter card is achievable at all;
            page.tsx used to own a standalone version of just the day field. */}
        <BookingsList
          appointments={appointments}
          providers={providers}
          timezone={timezone}
          noun={(me.labels.appointments ?? copy.nav.appointments).toLowerCase()}
          nowISO={new Date().toISOString()}
          isToday={isToday}
          dayLabel={dayShort}
          date={fieldFrom}
          toDate={fieldTo}
          customerId={customerId}
          dayHint={dayHint}
          emptyMessage={copy.bookings.none}
          initialStatus={status}
          initialQuery={query}
          initialSort={sort}
          initialStaff={staff}
          viewerIsStaff={me.member?.role === 'staff'}
          canReschedule={me.capabilities.reschedule}
          loadFailed={appointmentsResult.failed}
          earnings={earnings}
          capacityMin={capacity?.minutes ?? null}
        />
      </div>
    </>
  );
}

/**
 * Jira GRW-192 — the vertical names this screen, not us. A clinic reads
 * "Doctors" / "Patients" / "Visits" here; a garage "Mechanics" / "Jobs".
 */
export const generateMetadata = () => labelledTitle('appointments', TITLE_FALLBACK.appointments);
