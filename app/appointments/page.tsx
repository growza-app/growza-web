import { api, type Appointment } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { BookingsList } from './BookingsList';

export const dynamic = 'force-dynamic';

/** The full "Bookings" list — one day at a time (the API is a day-range query, same as the dashboard's "today" list), optionally narrowed to one stylist. */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; providerId?: string }>;
}) {
  const params = await searchParams;

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

  const appointments = await api.appointments(date, providerId || undefined).catch(() => [] as Appointment[]);
  const bookingsWord = me.labels.appointments ?? copy.nav.appointments;

  return (
    <>
      <PageHeader title={bookingsWord} subtitle={copy.bookings.subtitle} />

      <div className="page-body">
        <div className="card">
          <form method="get" className="filters">
            <div className="field">
              <label htmlFor="date">{copy.bookings.filterDay}</label>
              <input id="date" name="date" type="date" defaultValue={date} />
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
            <button className="btn" type="submit">
              {copy.bookings.show}
            </button>
          </form>
        </div>

        <div className="card">
          {appointments.length === 0 ? (
            <div className="empty">{copy.bookings.none}</div>
          ) : (
            <BookingsList
              appointments={appointments}
              timezone={timezone}
              noun={(me.labels.appointments ?? copy.nav.appointments).toLowerCase()}
            />
          )}
        </div>
      </div>
    </>
  );
}
