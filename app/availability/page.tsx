import { api } from '../lib/api';
import { formatDateWithWeekday } from '../lib/format';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { SlotGrid } from './SlotGrid';

export const dynamic = 'force-dynamic';

/** Live view of the availability engine, in the owner's words: "free times". */
export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string; date?: string; intent?: string }>;
}) {
  const params = await searchParams;
  const isBookingIntent = params.intent === 'book';

  let me, services, providers;
  try {
    [me, services, providers] = await Promise.all([api.me(), api.services(), api.providers()]);
  } catch {
    return (
      <>
        <PageHeader title={isBookingIntent ? copy.freeTimes.newBookingTitle : copy.freeTimes.title} />
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
  const serviceId = params.serviceId ?? services[0]?.id;
  const date = params.date ?? todayISO;

  const availability = serviceId ? await api.availability(serviceId, date, 'any') : null;

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
  });

  return (
    <>
      <PageHeader
        title={isBookingIntent ? copy.freeTimes.newBookingTitle : copy.freeTimes.title}
        subtitle={isBookingIntent ? copy.freeTimes.newBookingSubtitle : copy.freeTimes.subtitle}
      />

      <div className="page-body">
        <div className="card">
          <form method="get" className="filters filters-inline">
            {isBookingIntent && <input type="hidden" name="intent" value="book" />}
            <div className="field">
              <label htmlFor="serviceId">{copy.freeTimes.pickService}</label>
              <select id="serviceId" name="serviceId" defaultValue={serviceId}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {copy.services.minutes(s.durationMin)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="date">{copy.freeTimes.pickDay}</label>
              <select id="date" name="date" defaultValue={date}>
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateWithWeekday(new Date(`${d}T12:00:00Z`), timezone, { withYear: false })}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn">
              {copy.freeTimes.show}
            </button>
          </form>
        </div>

        {availability && (
          <div className="card">
            <div className="card-head">
              <span>{availability.service.name}</span>
              <span className="muted" style={{ fontWeight: 550, fontSize: 14 }}>
                {copy.freeTimes.countLabel(availability.slotCount)}
              </span>
            </div>
            <div className="card-body">
              {availability.slotCount === 0 ? (
                <div className="empty">{copy.freeTimes.none}</div>
              ) : (
                <SlotGrid
                  sections={availability.sections}
                  serviceId={availability.service.id}
                  serviceName={availability.service.name}
                  providerNames={Object.fromEntries(providers.map((p) => [p.id, p.displayName]))}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
