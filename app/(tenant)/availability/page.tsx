import { screenTitle } from '../lib/page-title';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { api, ApiError } from '../lib/api';
import { resolveBranchState } from '../lib/branch-context';
import { redirect } from 'next/navigation';
import { formatDateWithWeekday } from '../lib/format';
import { getTranslations, getLocale } from 'next-intl/server';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { PageHeader } from '../components/PageHeader';
import { SlotGrid } from './SlotGrid';

export const dynamic = 'force-dynamic';

/** Live view of the availability engine, in the owner's words: "free times". */
export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string; date?: string; intent?: string; branch?: string }>;
}) {
  const locale = await getLocale();
  const params = await searchParams;
  const isBookingIntent = params.intent === 'book';

  const t = await getTranslations('freeTimes');
  let me, services, providers;
  try {
    me = await api.me();
    // Jira GRW-379 — one branch's menu: a service is sold at one branch, and "any stylist" is that branch's.
    // The owner's pick (below), or a front desk's own branch; a one-branch business has only the one.
    const menu = resolveBranchState({
      branches: me.branches ?? [],
      role: me.member?.role ?? null,
      memberLocationId: me.member?.locationId ?? null,
      wanted: params.branch ?? null,
    }).one;
    [services, providers] = await Promise.all([api.services(menu ?? undefined), api.providers()]);
  } catch (error) {
    return (
      <>
        <PageHeader title={isBookingIntent ? t('newBookingTitle') : t('title')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  const timezone = me.tenant?.timezone ?? 'Asia/Kolkata';
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  // Jira GRW-392 (review) — the service must be on THIS branch's menu. Switching the branch submits the previous
  // branch's service with it, and the API refuses a service another branch sells; the new branch's first one stands in.
  const serviceId = services.some((s) => s.id === params.serviceId) ? params.serviceId : services[0]?.id;
  const date = params.date ?? todayISO;

  // Jira GRW-235 — a multi-branch business looks at one branch's free times; the main branch unless another is picked.
  // Owner only, like the booking sheet (product decision 2026-09-14).
  const branches = (me.member?.role ?? 'owner') === 'owner' ? (me.branches ?? []) : [];
  const branch = branches.length > 1 ? (branches.find((b) => b.id === params.branch) ?? branches[0]!).id : null;
  // QA (Jira GRW-377) — a stylist reaching this address got a 500: the API refuses them free times (403) and
  // this call sat outside the try above. A role the screen is not for lands on Home, as a Reports tab they
  // cannot open lands on one they can — never on an error to interpret. Anything else is a load failure.
  let availability;
  try {
    availability = serviceId ? await api.availability(serviceId, date, 'any', branch) : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) redirect('/');
    return (
      <>
        <PageHeader title={isBookingIntent ? t('newBookingTitle') : t('title')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
  });

  return (
    <>
      {/* Jira GRW-377 — the branch chosen on any other screen is the branch this opens on. */}
      <BranchUrlSync remember={false} />
      <PageHeader
        title={isBookingIntent ? t('newBookingTitle') : t('title')}
        subtitle={isBookingIntent ? t('newBookingSubtitle') : t('subtitle')}
      />

      <div className="page-body">
        <div className="card">
          <form method="get" className="filters filters-inline">
            {isBookingIntent && <input type="hidden" name="intent" value="book" />}
            <div className="field">
              <label htmlFor="serviceId">{t('pickService')}</label>
              <select id="serviceId" name="serviceId" defaultValue={serviceId}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {t('minutes', { count: s.durationMin })}
                  </option>
                ))}
              </select>
            </div>
            {/* Jira GRW-395 — the branch is the header's; the form only carries it, so "Show" keeps it. */}
            {branch ? <input type="hidden" name="branch" value={branch} /> : null}
            <div className="field">
              <label htmlFor="date">{t('pickDay')}</label>
              <select id="date" name="date" defaultValue={date}>
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateWithWeekday(new Date(`${d}T12:00:00Z`), timezone, { withYear: false, locale })}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn filters-show">
              {t('show')}
            </button>
          </form>
        </div>

        {availability && (
          <div className="card">
            <div className="card-head">
              <span>{availability.service.name}</span>
              <span className="muted" style={{ fontWeight: 550, fontSize: 14 }}>
                {t('countLabel', { count: availability.slotCount })}
              </span>
            </div>
            <div className="card-body">
              {availability.slotCount === 0 ? (
                <div className="empty">{t('none')}</div>
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
