import { api, type Appointment } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { IconSearch } from '../components/icons';
import { BookingsList } from './BookingsList';

export const dynamic = 'force-dynamic';

/** The full "Bookings" list — one day at a time (the API is a day-range query, same as the dashboard's "today" list), optionally narrowed to one stylist. */
const STATUS_LABEL: Record<string, string> = {
  cancelled: 'Cancelled',
  completed: 'Finished',
  confirmed: 'Confirmed',
  no_show: "Didn't come",
};

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; providerId?: string; status?: string }>;
}) {
  const params = await searchParams;
  // Deep-linked from Home's "Cancellation today" card (?status=cancelled) —
  // validated against the real statuses so a stray query param is ignored
  // rather than silently filtering everything out.
  const status = params.status && params.status in STATUS_LABEL ? params.status : '';

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

  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const date = params.date ?? todayISO;
  const providerId = params.providerId ?? '';

  const dayAppointments = await api.appointments(date, providerId || undefined).catch(() => [] as Appointment[]);
  // Filtered BEFORE reaching BookingsList, not after — so the KPI row,
  // revenue bar, and "Today's schedule" all consistently reflect just the
  // filtered slice, the same way the Staff filter already narrows the whole
  // dataset server-side rather than just hiding rows client-side.
  const appointments = status ? dayAppointments.filter((a) => a.status === status) : dayAppointments;
  const bookingsWord = me.labels.appointments ?? copy.nav.appointments;
  const isToday = date === todayISO;
  const dayHint = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00`));
  // Short form for the KPI/schedule/revenue labels when a non-today date is picked, e.g. "21 Aug".
  const dayShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00`),
  );
  const clearFilterParams = new URLSearchParams();
  if (params.date) clearFilterParams.set('date', params.date);
  if (providerId) clearFilterParams.set('providerId', providerId);
  const clearFilterHref = `/appointments${clearFilterParams.toString() ? `?${clearFilterParams.toString()}` : ''}`;

  return (
    <>
      <PageHeader
        title={bookingsWord}
        subtitle="All your appointments in one place."
        mobileSubtitle
        actions={
          <a className="icon-btn" href="/search" aria-label={copy.search.title}>
            <IconSearch />
          </a>
        }
        initial={(me.tenant?.name ?? 'S').charAt(0).toUpperCase()}
      />

      <div className="page-body bk-fit">
        <div className="card">
          <form method="get" className="filters filters-inline">
            <div className="field">
              <label htmlFor="date">{copy.bookings.filterDay}</label>
              <input id="date" name="date" type="date" defaultValue={date} />
              <span className="field-hint">{dayHint}</span>
            </div>
            <div className="field">
              <label htmlFor="providerId">{me.labels.providers ?? copy.nav.staff}</label>
              <select id="providerId" name="providerId" defaultValue={providerId}>
                <option value="">{copy.bookings.allStaff}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn filters-show" type="submit">
              {copy.bookings.show}
            </button>
          </form>
        </div>

        {status && (
          <div className="status-filter-banner">
            <span>
              Showing <strong>{STATUS_LABEL[status]}</strong> only
            </span>
            <a href={clearFilterHref}>Clear ✕</a>
          </div>
        )}

        {appointments.length === 0 ? (
          <div className="card">
            <div className="empty">{status ? `No ${STATUS_LABEL[status].toLowerCase()} bookings that day.` : copy.bookings.none}</div>
          </div>
        ) : (
          <BookingsList
            appointments={appointments}
            timezone={timezone}
            noun={(me.labels.appointments ?? copy.nav.appointments).toLowerCase()}
            nowISO={new Date().toISOString()}
            isToday={isToday}
            dayLabel={dayShort}
          />
        )}
      </div>
    </>
  );
}
