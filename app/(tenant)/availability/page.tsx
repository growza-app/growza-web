import { screenTitle } from '../lib/page-title';
import { api } from '../lib/api';
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
    [me, services, providers] = await Promise.all([api.me(), api.services(), api.providers()]);
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
            {branch ? (
              <div className="field">
                <label htmlFor="branch">{t('whichBranch')}</label>
                <select id="branch" name="branch" defaultValue={branch}>
                  {branches.map((b, i) => (
                    <option key={b.id} value={b.id}>
                      {i === 0 ? t('mainBranch', { name: b.name }) : b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
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
