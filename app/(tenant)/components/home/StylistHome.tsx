'use client';

import { useMemo } from 'react';
import { formatTime, type Appointment, type AttendanceRegister, type ProviderDay } from '../../lib/api';
import { clientNameLabel, groupBookings, summarizeServices, type BookingGroup } from '../../lib/appointment-display';
import { homeCopy, type HomeCopy } from '../../lib/home-copy';
import type { Lang } from '../../lib/lang';
import { currentAndNext, liveState, minutesBetween } from '../../lib/live-state';
import { IconChevronRight } from '../icons';
import { Avatar, CardError, HomeHeader } from './parts';

/**
 * Jira GRW-222 — a stylist's Home, as the design draws it: who is with me, who
 * is next, my day, my attendance.
 *
 * Every read is one `STAFF_ALLOWED` already carries and the API already scopes
 * to their own chair (`/appointments`, `/provider-day`, `/attendance`), so this
 * screen cannot show a colleague's client or the salon's takings.
 *
 * "Current" follows the floor rule: a visit is in the chair until it is paid,
 * so an upsold beard trim is still the current customer at 10:40.
 *
 * Not drawn, by agreement (Jira GRW-222 scope update 2): "You are on shift /
 * End shift" (Jira GRW-221), "Get ready" and "Add note" — none has anything to
 * save to, and a button that does nothing is the defect this repo keeps finding.
 */

export interface StylistHomeProps {
  lang: Lang;
  labels: Record<string, string>;
  businessName: string;
  locationName: string | null;
  /** Jira GRW-251 — their own branch at a business with more than one; null keeps the header as it was. */
  branch?: { closed: boolean; closesAt: string | null; openToday: boolean | null } | null;
  timezone: string;
  nowISO: string;
  dateLabel: string;
  greetingPart: 'morning' | 'afternoon' | 'evening';
  appointments: Appointment[] | null;
  day: ProviderDay | null;
  /** This month to today, their own rows only — the API scopes the register to them. */
  attendanceMonth: AttendanceRegister | null;
}

type WorkItem = { kind: 'visit'; key: string; startAt: string; group: BookingGroup } | { kind: 'break'; key: string; startAt: string; label: string };

function PersonCard({ t, group, timezone, now, mode }: { t: HomeCopy; group: BookingGroup; timezone: string; now: Date; mode: 'current' | 'next' }) {
  const name = clientNameLabel(group);
  const services = summarizeServices(group.serviceNames, t.lang);
  const time = formatTime(group.startAt, timezone);
  return (
    <a className={`hm-person-card ${mode === 'next' ? 'hm-person-next' : ''}`} href="/appointments">
      <Avatar name={name} id={group.key} size={46} />
      <span className="hm-row-main">
        <span className="hm-person-name">{name ?? services}</span>
        {/* Jira GRW-393 — with the client's name withheld the services ARE the title; not twice. */}
        {name ? <span className="hm-row-sub">{services}</span> : null}
        <span className="hm-row-meta">
          {mode === 'current' ? t.startedFor(time, minutesBetween(group.startAt, now)) : t.inMin(time, minutesBetween(now, group.startAt))}
        </span>
      </span>
      {mode === 'current' ? <IconChevronRight /> : null}
    </a>
  );
}

export function StylistHome(p: StylistHomeProps) {
  const t = homeCopy(p.lang, p.labels);
  const now = useMemo(() => new Date(p.nowISO), [p.nowISO]);
  const groups = useMemo(() => groupBookings((p.appointments ?? []).filter((a) => a.status !== 'cancelled')), [p.appointments]);
  const { current, next } = currentAndNext(groups, now);

  const work: WorkItem[] = useMemo(() => {
    const visits: WorkItem[] = groups.map((g) => ({ kind: 'visit', key: g.key, startAt: g.startAt, group: g }));
    // Breaks are the roster's own time blocks from `/provider-day`; nothing here invents a lunch hour.
    const breaks: WorkItem[] = (p.day?.entries ?? [])
      .filter((e) => e.kind === 'block')
      .map((e) => ({ kind: 'break', key: `b-${e.startAt}`, startAt: e.startAt, label: e.label }));
    return [...visits, ...breaks].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [groups, p.day]);

  const attendance = useMemo(() => {
    if (!p.attendanceMonth) return null;
    // `today` is the register's own local date, not the browser's or UTC's.
    const rows = p.attendanceMonth.rows.filter((r) => r.onDate <= p.attendanceMonth!.today);
    return {
      present: rows.filter((r) => r.status === 'present' || r.status === 'late' || r.status === 'half_day').length,
      leave: rows.filter((r) => r.status === 'leave' || r.status === 'absent').length,
      off: rows.filter((r) => !r.rostered && r.status === null).length,
    };
  }, [p.attendanceMonth]);

  /** The design's timeline states: done (green), the next one (purple), later (grey). */
  const pill = (g: BookingGroup) => {
    const state = liveState(g, now);
    if (state === 'done') return { tone: 'green', dot: 'done', label: t.status.completed };
    if (state === 'in_service') return { tone: 'blue', dot: 'now', label: t.status.inService };
    if (next && g.key === next.key) return { tone: 'violet', dot: 'next', label: t.inMinShort(minutesBetween(now, g.startAt)) };
    if (state === 'later') return { tone: 'grey', dot: 'later', label: t.status.later };
    if (state === 'no_show') return { tone: 'rose', dot: 'later', label: t.status.noShow };
    return { tone: 'amber', dot: 'later', label: t.status.needsAnswer };
  };

  return (
    <>
      <HomeHeader
        t={t}
        title={t.greeting(p.greetingPart)}
        sub={p.branch?.closesAt ? t.stylistSubUntil(p.branch.closesAt) : p.branch && !p.branch.closed && p.branch.openToday === false ? t.stylistSubClosedToday : t.stylistSub}
        businessName={p.businessName}
        locationName={p.locationName && p.branch?.closed ? t.branchClosed(p.locationName) : p.locationName}
        dateLabel={p.dateLabel}
      />

      <div className="page-body hm-page hm-stylist">
        {p.appointments === null ? <CardError t={t} /> : null}

        <div className="hm-stylist-pair">
          <section className="hm-block">
            <div className="hm-block-head">
              <h2>{t.currentCustomer}</h2>
              <a className="hm-link" href="/appointments">
                {t.viewDetails} ›
              </a>
            </div>
            <div className="hm-card hm-block-card">
              <span className="hm-block-inner-title">{t.currentCustomer}</span>
              {current ? <PersonCard t={t} group={current} timezone={p.timezone} now={now} mode="current" /> : <p className="hm-empty">{t.nobodyInChair}</p>}
            </div>
          </section>

          <section className="hm-block">
            <div className="hm-block-head">
              <h2>{t.nextCustomer}</h2>
              <a className="hm-link" href="/appointments">
                {t.viewAll} ›
              </a>
            </div>
            <div className="hm-card hm-block-card hm-card-next">
              <span className="hm-block-inner-title">{t.nextCustomer}</span>
              {next ? <PersonCard t={t} group={next} timezone={p.timezone} now={now} mode="next" /> : <p className="hm-empty">{t.noNextCustomer}</p>}
            </div>
          </section>
        </div>

        <section className="hm-card">
          <div className="hm-card-head">
            <h2>{t.todaysWork}</h2>
          </div>
          {work.length === 0 ? (
            <p className="hm-empty">{t.nothingToday}</p>
          ) : (
            <ol className="hm-timeline">
              {work.map((w) => {
                if (w.kind === 'break') {
                  return (
                    <li key={w.key} className="hm-tl hm-tl-break">
                      <span className="hm-row-time">{formatTime(w.startAt, p.timezone)}</span>
                      <span className="hm-tl-dot hm-tl-dot-later" />
                      <span className="hm-row-main">
                        <span className="hm-row-name">{t.breakTime}</span>
                        <span className="hm-row-sub">{w.label}</span>
                      </span>
                      <span className="hm-pill hm-pill-grey">{t.breakTime}</span>
                    </li>
                  );
                }
                const st = pill(w.group);
                return (
                  <li key={w.key} className="hm-tl">
                    <span className="hm-row-time">{formatTime(w.startAt, p.timezone)}</span>
                    <span className={`hm-tl-dot hm-tl-dot-${st.dot}`} />
                    <span className="hm-row-main">
                      <span className="hm-row-name">{clientNameLabel(w.group) ?? summarizeServices(w.group.serviceNames, t.lang)}</span>
                      {clientNameLabel(w.group) ? <span className="hm-row-sub">{summarizeServices(w.group.serviceNames, t.lang)}</span> : null}
                    </span>
                    <span className={`hm-pill hm-pill-${st.tone}`}>{st.label}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* The design keeps attendance to the phone; on a laptop it is one sidebar link away. */}
        <section className="hm-card hm-mobile">
          <div className="hm-card-head">
            <h2>{t.myAttendance}</h2>
            <a className="hm-link" href="/attendance">
              {t.view} ›
            </a>
          </div>
          {attendance === null ? (
            <CardError t={t} />
          ) : (
            <>
              <div className="hm-counts">
                <span className="hm-count hm-tone-green">
                  <strong>{attendance.present}</strong>
                  {t.present}
                </span>
                <span className="hm-count hm-tone-amber">
                  <strong>{attendance.leave}</strong>
                  {t.leave}
                </span>
                <span className="hm-count hm-tone-slate">
                  <strong>{attendance.off}</strong>
                  {t.off}
                </span>
              </div>
              <p className="hm-card-foot">{t.attendanceNote}</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
