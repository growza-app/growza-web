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
  } catch {
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
  const date = params.date ?? todayISO;
  // GRW-47: the filter is a From/To range now. `to` defaults to `date`, so
  // the common case is still exactly one day and every "today" label below
  // keeps meaning what it did; a `to` earlier than `date` is ignored by the
  // API rather than returning nothing.
  const toDate = params.to && params.to >= date ? params.to : date;
  const isRange = toDate !== date;

  // GRW-47: no `providerId` — staff filtering now lives entirely client-side
  // in BookingsList (search + staff select on desktop, chips on mobile),
  // so the server always loads the full range rather than a server-narrowed
  // slice that a client-side filter could contradict.
  // Status is NOT filtered here any more: it seeds BookingsList's own Status
  // control instead, so there is one filtering mechanism rather than a
  // server-side pass and a client-side control that can disagree. The KPI row
  // therefore keeps showing the day's real totals while the list narrows —
  // the same split search and the staff filter already use.
  const appointments = await api.appointments(date, toDate).catch(() => [] as Appointment[]);
  const bookingsWord = me.labels.appointments ?? copy.nav.appointments;
  // A multi-day range is never "today", even when it starts today — the
  // headline labels ("Today", "Next 2 hrs") would be lying about the rest.
  const isToday = !isRange && date === todayISO;
  const dayHint = formatDateWithWeekday(new Date(`${date}T12:00:00`), timezone);
  // Short form for the KPI/schedule labels when a non-today date is picked, e.g. "21 Aug" — or "21 Aug – 24 Aug" for a range.
  const dayShort = isRange
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
        initial={(me.tenant?.name ?? 'S').charAt(0).toUpperCase()}
      />

      <div className="page-body bk-fit">
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
          date={date}
          toDate={toDate}
          dayHint={dayHint}
          emptyMessage={copy.bookings.none}
          initialStatus={status}
          initialQuery={query}
          initialSort={sort}
          initialStaff={staff}
        />
      </div>
    </>
  );
}
