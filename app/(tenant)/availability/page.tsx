import { screenTitle } from '../lib/page-title';
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
  searchParams: Promise<{ serviceId?: string; date?: string; intent?: string; branch?: string }>;
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

  // Jira GRW-235 — a multi-branch business looks at one branch's free times; the main branch unless another is picked.
  // Owner only, like the booking sheet (product decision 2026-09-14).
  const branches = (me.member?.role ?? 'owner') === 'owner' ? (me.branches ?? []) : [];
  const branch = branches.length > 1 ? (branches.find((b) => b.id === params.branch) ?? branches[0]!).id : null;
  const availability = serviceId ? await api.availability(serviceId, date, 'any', branch) : null;

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
            {branch ? (
              <div className="field">
                <label htmlFor="branch">{copy.newVisit.whichBranch}</label>
                <select id="branch" name="branch" defaultValue={branch}>
                  {branches.map((b, i) => (
                    <option key={b.id} value={b.id}>
                      {i === 0 ? `${b.name} (Main)` : b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
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

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Free times');
