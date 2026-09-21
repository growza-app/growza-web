'use client';

import { useTranslations } from 'next-intl';
import { useNewVisitCopy } from '../lib/use-copy';
import { useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import type { AvailabilityResponse, Offer, Provider, Service } from '../lib/api-types';
import { lastVisitOf, nextFreeTimes, type FreeTime } from '../lib/book-again';

/** Jira GRW-341 — what "Book again" would fill in. */
export interface BookAgainPlan {
  services: Service[];
  /** Null is "anyone free" — the last stylist has left, or the visit had none. */
  providerId: string | null;
  /** The combo, when the last visit was one and it is still on offer. */
  offer: Offer | null;
}

const WIDE_FROM = '2000-01-01';
const WIDE_TO = '2099-12-31';
const NEXT_TIMES = 3;

/**
 * "Book again" — a returning client's last visit, offered back with the next free times.
 *
 * The screen used to ask for everything again: services, stylist, day, time. Most bookings repeat the last visit
 * and most people take the next free time, so this puts both on the first thing you see after choosing the client:
 * one tap on a time fills the services, the stylist and the time and lands on the confirm step.
 *
 * Nothing shows for a client with no history, or while it is still being worked out, or when the last visit's
 * service is no longer offered — the step then works exactly as it did. A stylist who has left is not an error:
 * the card says "anyone free" and the times are looked up for whoever is.
 */
export function BookAgainCard({
  clientId,
  services,
  providers,
  offers,
  branchId,
  days,
  timezone,
  later,
  onUse,
  onPickTime,
}: {
  clientId: string;
  services: readonly Service[];
  /** Only the people who could take it — the chosen branch's staff. */
  providers: readonly Provider[];
  offers: readonly Offer[];
  branchId: string | null;
  /** The local days to look through, today first. */
  days: readonly string[];
  timezone: string;
  /** "For later": show the next free times. Otherwise the card is one button. */
  later: boolean;
  /** Fill the services and the stylist, and stay to look. `moveOn` also opens the time step. */
  onUse: (plan: BookAgainPlan, moveOn: boolean) => void;
  onPickTime: (plan: BookAgainPlan, time: FreeTime) => void;
}) {
  const tmin = useTranslations('services');
  const nv = useNewVisitCopy();
  const [last, setLast] = useState<{ plan: BookAgainPlan; startAt: string } | null>(null);
  const [times, setTimes] = useState<FreeTime[] | 'loading' | 'failed'>('loading');

  // 1. Who they were last time.
  useEffect(() => {
    let cancelled = false;
    setLast(null);
    void api
      .appointments(WIDE_FROM, WIDE_TO, undefined, clientId)
      .then((rows) => {
        if (cancelled) return;
        const visit = lastVisitOf(rows, new Date());
        if (!visit) return;
        const byId = new Map(services.map((s) => [s.id, s]));
        const picked = visit.serviceIds.map((id) => byId.get(id));
        // A service that is no longer offered means we cannot honestly say "the same again".
        if (picked.length === 0 || picked.some((s) => !s)) return;
        const offer = visit.offerTitle ? (offers.find((o) => o.title === visit.offerTitle && sameSet(o.serviceIds, visit.serviceIds)) ?? null) : null;
        const providerId = visit.providerId && providers.some((p) => p.id === visit.providerId) ? visit.providerId : null;
        setLast({ plan: { services: picked as Service[], providerId, offer }, startAt: visit.startAt });
      })
      .catch(() => {
        /* No card is better than a wrong one. */
      });
    return () => {
      cancelled = true;
    };
    // Re-run when the lists arrive, not on every render of the parent.
  }, [clientId, services, providers, offers]);

  // 2. When it would fit.
  const serviceKey = last?.plan.services.map((s) => s.id).join(',') ?? '';
  useEffect(() => {
    if (!later || !last) return;
    let cancelled = false;
    setTimes('loading');
    const ids = last.plan.services.map((s) => s.id);
    void nextFreeTimes(days, NEXT_TIMES, (day): Promise<AvailabilityResponse> => api.availability(ids, day, last.plan.providerId ?? 'any', branchId))
      .then((t) => {
        if (!cancelled) setTimes(t);
      })
      .catch(() => {
        if (!cancelled) setTimes('failed');
      });
    return () => {
      cancelled = true;
    };
    // `last` is its own change key via `serviceKey` + provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [later, serviceKey, last?.plan.providerId, branchId, days.join(',')]);

  const dayLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: timezone });
    return (iso: string) => fmt.format(new Date(iso));
  }, [timezone]);
  const dayName = useMemo(() => {
    const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: timezone });
    return (day: string) =>
      day === days[0] ? nv.today : day === days[1] ? nv.bookAgainTomorrow : weekday.format(new Date(`${day}T12:00:00Z`));
  }, [timezone, days]);

  if (!last) return null;
  const sameDay = Array.isArray(times) && times.length > 0 && times.every((t) => t.day === times[0]!.day);
  const { plan } = last;
  const names = plan.offer ? plan.offer.title : plan.services.map((s) => s.name).join(' + ');
  const minutes = plan.services.reduce((n, s) => n + s.durationMin, 0);
  const priced = plan.services.every((s) => s.priceMinor !== null);
  const price = plan.offer?.comboPriceMinor ?? (priced ? String(plan.services.reduce((n, s) => n + Number(s.priceMinor), 0)) : null);
  const staff = plan.providerId ? providers.find((p) => p.id === plan.providerId)?.displayName : null;

  return (
    <section className="wi-again" aria-label={nv.bookAgain}>
      <div className="wi-again-top">
        <h2 className="wi-again-title">{nv.bookAgain}</h2>
        <span className="wi-again-when">{nv.bookAgainLastVisit(dayLabel(last.startAt))}</span>
      </div>
      <div className="wi-again-what">{names}</div>
      <div className="wi-again-meta">
        {[staff ? nv.bookAgainWithStaff(staff) : nv.bookAgainAnyone, tmin('minutes', { count: minutes }), price ? formatMoney(price) : null]
          .filter(Boolean)
          .join(' · ')}
      </div>

      {later ? (
        <>
          {/* All on one day: say the day once, so the three times fit on one row of a small phone. */}
          <div className="wi-again-label">
            {nv.bookAgainTimes}
            {sameDay ? ` · ${dayName(times[0]!.day)}` : ''}
          </div>
          {times === 'loading' ? (
            <div className="wi-again-note">{nv.bookAgainFinding}</div>
          ) : times === 'failed' || times.length === 0 ? (
            <div className="wi-again-note">{times === 'failed' ? nv.noTimes : nv.bookAgainNoTimes}</div>
          ) : (
            <div className="wi-again-times" role="group" aria-label={nv.bookAgainTimes}>
              {times.map((t) => (
                <button key={t.utc} type="button" className="wi-again-time" onClick={() => onPickTime(plan, t)}>
                  {sameDay ? t.local : `${dayName(t.day)} · ${t.local}`}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="wi-again-link" onClick={() => onUse(plan, true)}>
            {nv.bookAgainOtherTime}
          </button>
        </>
      ) : (
        <button type="button" className="btn wi-again-use" onClick={() => onUse(plan, false)}>
          {nv.bookAgainUse}
        </button>
      )}
    </section>
  );
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
}
