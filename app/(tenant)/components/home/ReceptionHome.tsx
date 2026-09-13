'use client';

import { useMemo, useState } from 'react';
import { formatTime, type Appointment, type Provider, type QueueEntry } from '../../lib/api';
import { clientNameLabel, groupBookings, summarizeServices, type BookingGroup } from '../../lib/appointment-display';
import { homeCopy, type HomeCopy } from '../../lib/home-copy';
import type { Lang } from '../../lib/lang';
import { countsAsNotMarked, liveState, longerThanBooked, minutesBetween } from '../../lib/live-state';
import { IconBan, IconCalendarPlus, IconChevronRight, IconClipboardCheck, IconClock, IconMenu, IconReceipt, IconSearch, IconUserPlus } from '../icons';
import { NewVisitSheet, type VisitMode } from '../NewVisitSheet';
import { GiveToStaffSheet } from './GiveToStaffSheet';
import { Avatar, avatarKey, CardError, HomeHeader, QuickTiles } from './parts';

/**
 * Jira GRW-222 — the front desk's Home, as the design draws it.
 *
 * ## The salon floor, with no arrival tracking
 *
 * - **Walk-ins** wait in a first-come queue. Adding one IS the arrival, so
 *   "Waiting 10 min" is true without anybody tapping anything else.
 * - **Online bookings** run on the clock: "Later today" shows their time.
 * - **Everybody** stays "Here now" until they are paid — an upsell at the chair
 *   is added at the till and keeps the stylist busy until then.
 *
 * The queue is optional. A desk that records a walk-in and its payment in one
 * go never uses it, and reads Waiting (0).
 */

export interface ReceptionHomeProps {
  lang: Lang;
  labels: Record<string, string>;
  businessName: string;
  locationName: string | null;
  timezone: string;
  nowISO: string;
  dateLabel: string;
  greetingPart: 'morning' | 'afternoon' | 'evening';
  appointments: Appointment[] | null;
  queue: QueueEntry[] | null;
  providers: Provider[];
}

type Tab = 'waiting' | 'later' | 'done';

function hereNowStatus(t: HomeCopy, g: BookingGroup, now: Date, timezone: string) {
  const over = longerThanBooked(g, now);
  return {
    tone: over ? 'amber' : 'green',
    label: over ? t.longerThanBooked : t.status.inService,
    sub: over ? `${t.started(formatTime(g.startAt, timezone))} · ${minutesBetween(g.startAt, now)} min` : t.started(formatTime(g.startAt, timezone)),
  };
}

export function ReceptionHome(p: ReceptionHomeProps) {
  const t = homeCopy(p.lang, p.labels);
  const now = useMemo(() => new Date(p.nowISO), [p.nowISO]);
  const [sheet, setSheet] = useState<VisitMode | null>(null);
  const [tab, setTab] = useState<Tab>('waiting');
  const [giving, setGiving] = useState<QueueEntry | null>(null);

  const groups = useMemo(() => groupBookings(p.appointments ?? []), [p.appointments]);
  const hereNow = groups.filter((g) => liveState(g, now) === 'in_service');
  const later = groups.filter((g) => liveState(g, now) === 'later');
  const done = groups.filter((g) => liveState(g, now) === 'done');
  const queue = p.queue ?? [];

  // Who is in each chair right now, from the same "until paid" rule as Here now.
  const busy = useMemo(() => {
    const m = new Map<string, { client: string; min: number }>();
    for (const g of hereNow) {
      for (const a of g.appointments) {
        if (a.providerId && !m.has(a.providerId)) m.set(a.providerId, { client: clientNameLabel(g) ?? summarizeServices(g.serviceNames), min: minutesBetween(g.startAt, now) });
      }
    }
    return m;
  }, [hereNow, now]);

  const attention = [
    { key: 'unmarked', count: groups.filter((g) => countsAsNotMarked(g, now)).length, label: t.notMarkedDone, tone: 'amber', href: '/appointments?status=confirmed', icon: <IconClock /> },
    { key: 'waiting', count: queue.filter((q) => minutesBetween(q.addedAt, now) >= 10).length, label: t.waitingOver10, tone: 'rose', href: '#hm-queue', icon: <IconMenu /> },
    { key: 'cancelled', count: groups.filter((g) => g.status === 'cancelled').length, label: t.cancelledTodayShort, tone: 'violet', href: '/appointments?status=cancelled', icon: <IconBan /> },
  ];

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'waiting', label: t.waitingTab(queue.length) },
    { value: 'later', label: t.laterTodayTab(later.length) },
    { value: 'done', label: t.doneTodayTab(done.length) },
  ];

  return (
    <>
      <HomeHeader t={t} title={t.greeting(p.greetingPart)} sub={t.receptionSub} businessName={p.businessName} locationName={p.locationName} dateLabel={p.dateLabel} />

      <div className="page-body hm-page hm-desk">
        {/* Laptop only: on a phone the tab bar's raised Walk-in is this button. */}
        <div className="hm-primary-actions hm-desktop">
          <button type="button" className="hm-action hm-action-dark" onClick={() => setSheet('now')}>
            <IconUserPlus />
            <strong>{t.walkInNow}</strong>
          </button>
          <button type="button" className="hm-action" onClick={() => setSheet('later')}>
            <IconCalendarPlus />
            <strong>{t.newAppointment}</strong>
          </button>
        </div>

        {p.appointments === null ? <CardError t={t} /> : null}

        <section>
          <h2 className="hm-section-title">{t.needsAttention}</h2>
          <div className="hm-att-tiles">
            {attention.map((a) => (
              <a key={a.key} className={`hm-att-tile hm-tone-${a.tone}`} href={a.href} onClick={a.key === 'waiting' ? () => setTab('waiting') : undefined}>
                <span className="hm-att-icon">{a.icon}</span>
                <strong className="hm-att-count">{a.count}</strong>
                <IconChevronRight />
                <span className="hm-att-tile-label">{a.label}</span>
              </a>
            ))}
          </div>
        </section>

        <div className="hm-desk-grid">
          <section className="hm-card">
            <div className="hm-card-head">
              <h2>
                {t.hereNow} {hereNow.length ? <span className="hm-title-accent">· {t.beingServed(hereNow.length)}</span> : null}
              </h2>
              <a className="hm-link" href="/appointments">
                {t.viewAll} ›
              </a>
            </div>
            {hereNow.length === 0 ? (
              <p className="hm-empty">{t.nobodyHere}</p>
            ) : (
              <ul className="hm-rows">
                {hereNow.map((g) => {
                  const name = clientNameLabel(g);
                  const st = hereNowStatus(t, g, now, p.timezone);
                  return (
                    <li key={g.key} className="hm-row">
                      <Avatar name={name} id={avatarKey(g)} />
                      <span className="hm-row-main">
                        <span className="hm-row-name">{name ?? summarizeServices(g.serviceNames)}</span>
                        <span className="hm-row-sub">
                          {summarizeServices(g.serviceNames)}
                          {g.providerNames.length ? ` · ${g.providerNames.join(', ')}` : ''}
                        </span>
                      </span>
                      <span className="hm-row-end">
                        <span className={`hm-dot-status hm-dot-${st.tone}`}>
                          <i />
                          {st.label}
                        </span>
                        <span className="hm-row-meta">{st.sub}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="hm-queue-block" id="hm-queue">
            <div className="hm-seg hm-seg-soft" role="tablist" aria-label={t.waitingQueue}>
              {tabs.map((x) => (
                <button key={x.value} type="button" role="tab" aria-selected={tab === x.value} className={tab === x.value ? 'is-on' : ''} onClick={() => setTab(x.value)}>
                  {x.label}
                </button>
              ))}
            </div>
            <div className="hm-card hm-queue-card">
              {tab === 'waiting' ? (
                queue.length === 0 ? (
                  <p className="hm-empty">{t.nobodyWaiting}</p>
                ) : (
                  <ol className="hm-rows">
                    {queue.map((q, i) => (
                      <li key={q.id} className="hm-row">
                        <span className="hm-idx">{i + 1}</span>
                        <span className="hm-row-main">
                          <span className="hm-row-name">{q.customerName}</span>
                          <span className="hm-row-sub">{q.serviceNames.join(' + ')}</span>
                          {/* Narrow phones: the wait moves under the name rather than off the row. */}
                          <span className="hm-wait hm-wait-inline">{t.waitingMin(minutesBetween(q.addedAt, now))}</span>
                        </span>
                        <span className="hm-wait hm-wait-side">{t.waitingMin(minutesBetween(q.addedAt, now))}</span>
                        <button type="button" className="hm-give" onClick={() => setGiving(q)}>
                          {t.giveToStaff}
                        </button>
                      </li>
                    ))}
                  </ol>
                )
              ) : tab === 'later' ? (
                later.length === 0 ? (
                  <p className="hm-empty">{t.nothingLater}</p>
                ) : (
                  <ol className="hm-rows">
                    {later.map((g, i) => {
                      const name = clientNameLabel(g);
                      const stylistId = g.appointments[0]?.providerId ?? null;
                      const stylistBusy = stylistId && busy.has(stylistId) && minutesBetween(now, g.startAt) <= 15;
                      return (
                        <li key={g.key} className="hm-row">
                          <span className="hm-idx">{i + 1}</span>
                          <span className="hm-row-main">
                            <span className="hm-row-name">{name ?? summarizeServices(g.serviceNames)}</span>
                            <span className="hm-row-sub">
                              {summarizeServices(g.serviceNames)}
                              {g.providerNames.length ? ` · ${g.providerNames.join(', ')}` : ''}
                            </span>
                          </span>
                          {stylistBusy ? (
                            <span className="hm-wait hm-wait-rose">{t.stillBusy(g.providerNames[0] ?? '')}</span>
                          ) : (
                            <span className="hm-wait">
                              {formatTime(g.startAt, p.timezone)} · {t.inMinShort(minutesBetween(now, g.startAt))}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )
              ) : done.length === 0 ? (
                <p className="hm-empty">{t.nothingDone}</p>
              ) : (
                <ol className="hm-rows">
                  {done.map((g, i) => {
                    const name = clientNameLabel(g);
                    return (
                      <li key={g.key} className="hm-row">
                        <span className="hm-idx">{i + 1}</span>
                        <span className="hm-row-main">
                          <span className="hm-row-name">{name ?? summarizeServices(g.serviceNames)}</span>
                          <span className="hm-row-sub">{summarizeServices(g.serviceNames)}</span>
                        </span>
                        <span className="hm-pill hm-pill-green">{t.status.completed}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        </div>

        <QuickTiles
          items={[
            { href: '/customers?add=1', label: t.addCustomer, icon: <IconUserPlus />, tone: 'blue' },
            // Path C — record the walk-in and take the money in one go.
            { onClick: () => setSheet('now'), label: t.takeMoney, icon: <IconReceipt />, tone: 'green' },
            { href: '/attendance', label: t.nav.attendance, icon: <IconClipboardCheck />, tone: 'violet' },
            // `/customers` search, not `/search`: the global search route is not
            // on the receptionist's allowlist (GRW-199), the client list's is.
            { href: '/customers', label: t.findCustomer, icon: <IconSearch />, tone: 'amber' },
          ]}
        />
      </div>

      {sheet ? <NewVisitSheet mode={sheet} timezone={p.timezone} onClose={() => setSheet(null)} /> : null}
      {giving ? <GiveToStaffSheet t={t} entry={giving} providers={p.providers} busy={busy} onClose={() => setGiving(null)} /> : null}
    </>
  );
}
