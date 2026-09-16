'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, type Appointment, type CustomerStats, type HomeOverview, type HomePeriod } from '../../lib/api';
import { groupBookings } from '../../lib/appointment-display';
import { branchPace } from '../../lib/branch-pace';
import { homeCopy } from '../../lib/home-copy';
import type { Lang } from '../../lib/lang';
import { canSee, type MemberRole } from '../../lib/nav-policy';
import {
  IconAnalytics,
  IconBan,
  IconCalendarPlus,
  IconChat,
  IconChevronDown,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconDaySummary,
  IconOffers,
  IconReceipt,
  IconReports,
  IconServices,
  IconSettings,
  IconStaff,
} from '../icons';
import { NewVisitSheet, type VisitPurpose } from '../NewVisitSheet';
import { DaySummarySheet } from './DaySummarySheet';
import { MoneyHero } from './MoneyHero';
import { AttentionList, BookingRows, Card, CardError, HomeHeader, QuickTiles, Segmented, SegmentCards, rupees } from './parts';

/**
 * Jira GRW-222 — the owner's Home.
 *
 * Server-rendered first paint (the page hands in today's overview), then the
 * period switch and the branch picker re-read `/api/v1/home` from the browser.
 *
 * ## The branch picker only exists for a business with branches
 *
 * "Multi-branch" is not a setting stored anywhere: the admin's "More than one
 * branch" toggle decides how many `location` rows enrolment writes, and the
 * rows are the truth. So the picker, the "All branches" roll-up and the
 * "Your branches" card appear when the business has more than one active
 * branch, and a single-branch salon sees none of them — not a disabled picker
 * with one entry in it.
 */

const HOME_BOOKINGS_SHOWN = 6;

/**
 * Jira GRW-222 — the laptop Home is one screen, no scroll.
 *
 * The same media query as the `.hm-fit` block in 83-role-home.css: a desktop
 * width and a page at least 680px tall. Below that (phones, tablets, a very
 * short window) Home scrolls as a normal page.
 *
 * The money row keeps its own (compact) height and Bookings today gets the rest
 * of the page, in whole rows — side by side when the business has one branch.
 */
const FIT_QUERY = '(min-width: 1101px) and (min-height: 680px)';

/**
 * Fit mode, and how many bookings the list's box holds.
 *
 * The box's height is decided by CSS (row 2 of the owner grid takes whatever
 * the money row leaves), so counting rows is a measurement, not a guess: whole
 * rows that fit, times the columns the list is laid out in.
 *
 * Jira GRW-225 — the measurement must never feed itself. The box sits in a
 * `minmax(0, 1fr)` row and clips, so the rows rendered from this count cannot
 * make the box taller; before, the first paint's six rows set the row's
 * min-content and every later measurement read six back.
 */
function useFitBookings(multiBranch: boolean) {
  const listRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ fit: boolean; count: number }>({ fit: false, count: HOME_BOOKINGS_SHOWN });
  useLayoutEffect(() => {
    const mq = window.matchMedia(FIT_QUERY);
    const el = listRef.current;
    const measure = () => {
      if (!mq.matches) {
        setState({ fit: false, count: HOME_BOOKINGS_SHOWN });
        return;
      }
      const cols = multiBranch ? 1 : 2;
      const rowH = el?.querySelector<HTMLElement>('.hm-row')?.offsetHeight || 47;
      const rows = el ? Math.max(1, Math.floor(el.clientHeight / rowH)) : 1;
      setState((prev) => (prev.fit && prev.count === rows * cols ? prev : { fit: true, count: rows * cols }));
    };
    measure();
    mq.addEventListener('change', measure);
    const ro = el ? new ResizeObserver(measure) : null;
    if (el) ro!.observe(el);
    return () => {
      mq.removeEventListener('change', measure);
      ro?.disconnect();
    };
  }, [multiBranch]);
  return { listRef, ...state };
}

export interface OwnerHomeProps {
  lang: Lang;
  labels: Record<string, string>;
  businessName: string;
  primaryLocationName: string | null;
  timezone: string;
  nowISO: string;
  dateLabel: string;
  greetingPart: 'morning' | 'afternoon' | 'evening';
  role: MemberRole | null;
  reportTabs?: string[];
  whatsappLive: boolean;
  /** Jira GRW-266 · GRW-271 — false in production: no Try WhatsApp tile. */
  whatsappDemo: boolean;
  initial: HomeOverview | null;
  /** Today's visits — or tomorrow's once the business has closed for the day. */
  appointments: Appointment[] | null;
  listIsTomorrow: boolean;
  customerStats: CustomerStats | null;
  /** Null when the register could not be read; the card is then left out rather than shown as 0. */
  staffNotMarkedIn: number | null;
}

export function OwnerHome(p: OwnerHomeProps) {
  const t = homeCopy(p.lang, p.labels);
  const now = useMemo(() => new Date(p.nowISO), [p.nowISO]);
  const [period, setPeriod] = useState<HomePeriod>('today');
  const [branch, setBranch] = useState<string | null>(null);
  const [data, setData] = useState<HomeOverview | null>(p.initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(p.initial === null);
  const [branchMenu, setBranchMenu] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  /** Laptop only — on a phone the tab bar's centre button opens this same sheet. */
  const [visitSheet, setVisitSheet] = useState<VisitPurpose | null>(null);
  const mayBook = p.role !== 'staff';

  const load = (nextPeriod: HomePeriod, nextBranch: string | null) => {
    setLoading(true);
    api
      .home(nextPeriod, nextBranch)
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  const branches = data?.branches ?? [];
  const multiBranch = branches.length > 1;
  const selected = branches.find((b) => b.id === branch) ?? null;
  const hours = data?.hoursToday ?? p.initial?.hoursToday ?? null;
  const afterClose = hours?.afterClose ?? false;

  const locationLine = multiBranch ? (selected?.name ?? t.allBranches) : p.primaryLocationName;

  // Two columns when there is no branches card beside the list (see .hm-bookings-wide).
  const fit = useFitBookings((data?.branches ?? []).length > 1);
  const bookingsShown = fit.count;

  const groups = useMemo(() => {
    // Cancelled visits are counted in Needs attention and listed on Bookings;
    // on Home they would push the day's real work out of a six-row window.
    const list = (p.appointments ?? []).filter((a) => a.status !== 'cancelled' && (!branch || !a.locationId || a.locationId === branch));
    const all = groupBookings(list);
    // Anchor the window on now: one visit already under way, then what is next.
    const firstLive = all.findIndex((g) => new Date(g.endAt).getTime() > now.getTime());
    const from = p.listIsTomorrow || firstLive < 0 ? 0 : Math.max(0, firstLive - 1);
    return { shown: all.slice(from, from + bookingsShown), total: all.length };
  }, [p.appointments, p.listIsTomorrow, branch, now, bookingsShown]);

  const closeTime = hours?.closesAt ? formatClock(hours.closesAt) : null;

  const attention = data
    ? [
        {
          key: 'unmarked',
          count: data.attention.notMarkedDone,
          label: t.notMarkedDone,
          sub: t.fromToday,
          tone: 'amber' as const,
          href: '/appointments?status=confirmed',
          icon: <IconClock />,
        },
        {
          key: 'cancelled',
          count: data.attention.cancelledToday,
          label: t.cancelledTodayShort,
          sub: t.todayWord,
          tone: 'rose' as const,
          href: '/appointments?status=cancelled',
          icon: <IconBan />,
        },
        ...(p.staffNotMarkedIn !== null
          ? [
              {
                key: 'attendance',
                count: p.staffNotMarkedIn,
                label: t.staffNotMarkedIn,
                sub: t.attendanceWord,
                tone: 'blue' as const,
                href: '/attendance',
                icon: <IconClipboardCheck />,
              },
            ]
          : []),
      ]
    : [];

  const links = [
    { href: '/providers', label: t.nav.staff, icon: <IconStaff />, tone: 'rose' },
    { href: '/services', label: t.nav.services, icon: <IconServices />, tone: 'green' },
    { href: '/offers', label: t.nav.offers, icon: <IconOffers />, tone: 'violet' },
    { href: '/attendance', label: t.nav.attendance, icon: <IconClipboardCheck />, tone: 'violet' },
    { href: '/reports', label: t.nav.reports, icon: <IconReports />, tone: 'amber' },
    { href: '/availability', label: t.nav.freeTimes, icon: <IconAnalytics />, tone: 'amber' },
    ...(p.whatsappDemo ? [{ href: '/try-whatsapp', label: t.nav.whatsapp, icon: <IconChat />, tone: 'green', pill: p.whatsappLive ? null : t.nav.demo }] : []),
    { href: '/settings', label: t.nav.settings, icon: <IconSettings />, tone: 'slate' },
  ].filter((l) => canSee(l.href, p.role, p.reportTabs));

  return (
    <>
      <HomeHeader
        t={t}
        title={t.greeting(p.greetingPart)}
        sub={t.ownerSub(p.businessName, afterClose)}
        businessName={p.businessName}
        locationName={locationLine}
        dateLabel={p.dateLabel}
        onDaySummary={() => setSummaryOpen(true)}
      />

      <div className="page-body hm-page hm-fit">
        {afterClose && closeTime ? (
          <button type="button" className="hm-closed" onClick={() => setSummaryOpen(true)}>
            <span className="hm-closed-icon">
              <IconDaySummary />
            </span>
            <span className="hm-closed-text">
              <strong>{t.dayClosed(closeTime)}</strong>
              <span>{t.dayClosedSub}</span>
            </span>
            <IconChevronRight />
          </button>
        ) : null}

        <div className="hm-toolbar">
          <Segmented
            label={t.today}
            value={period}
            options={[
              { value: 'today', label: t.today },
              { value: 'week', label: t.week },
              { value: 'month', label: t.month },
            ]}
            onChange={(v) => {
              setPeriod(v);
              load(v, branch);
            }}
          />
          <div className="hm-toolbar-end">
            {mayBook ? (
              /* One booking button, not "Walk-in" + "New appointment": both opened
                 the same sheet, whose own toggle chooses now-or-later.
                 "Record payment" is the walk-in steps ending in the till, for a
                 visit that has just finished. */
              <div className="hm-primary-actions hm-toolbar-actions hm-desktop">
                <button type="button" className="hm-action" onClick={() => setVisitSheet('payment')}>
                  <IconReceipt />
                  <strong>{t.recordPayment}</strong>
                </button>
                <button type="button" className="hm-action hm-action-dark" onClick={() => setVisitSheet('visit')}>
                  <IconCalendarPlus />
                  <strong>{t.nav.newBooking}</strong>
                </button>
              </div>
            ) : null}
            {multiBranch ? (
              <div className="hm-branch">
                <button type="button" className="hm-branch-btn" aria-haspopup="menu" aria-expanded={branchMenu} onClick={() => setBranchMenu((o) => !o)}>
                  {selected?.name ?? t.allBranches}
                  <IconChevronDown />
                </button>
                {branchMenu ? (
                  <div className="hm-menu hm-menu-right" role="menu">
                    {[{ id: null as string | null, name: t.allBranches }, ...branches].map((b) => (
                      <button
                        key={b.id ?? 'all'}
                        type="button"
                        role="menuitemradio"
                        aria-checked={branch === b.id}
                        onClick={() => {
                          setBranch(b.id);
                          setBranchMenu(false);
                          load(period, b.id);
                        }}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className={`hm-owner-grid ${multiBranch ? 'hm-multi' : ''}`}>
          <div className="hm-area-hero">{data ? <MoneyHero t={t} data={data} loading={loading} /> : <CardError t={t} onRetry={() => load(period, branch)} />}</div>

          {/* The design gives "Needs your attention" to the laptop only; a phone's
              Home is money, shortcuts, branches, clients and the day. */}
          <Card className="hm-area-attention hm-desktop" title={t.needsYourAttention}>
            {failed && !data ? <CardError t={t} /> : <AttentionList items={attention} />}
          </Card>

          <Card className="hm-area-links hm-mobile" title={t.quickLinks}>
            <QuickTiles items={links} />
          </Card>

          {multiBranch && data ? (
            <Card className="hm-area-branches" title={t.yourBranches}>
              <ul className="hm-rows">
                {branches.map((b, i) => {
                  const pace = branchPace(b.bookingsToday, branches.map((x) => x.bookingsToday));
                  const picked = branch === b.id;
                  return (
                    <li key={b.id} className={`hm-row hm-row-button ${picked ? 'is-picked' : ''}`}>
                      <button
                        type="button"
                        aria-pressed={picked}
                        onClick={() => {
                          // Tapping the branch already picked goes back to all of them.
                          const next = picked ? null : b.id;
                          setBranch(next);
                          load(period, next);
                        }}
                      >
                        <span className={`hm-branch-tile hm-tone-${BRANCH_TONES[i % BRANCH_TONES.length]}`}>{branchInitials(b.name)}</span>
                        <span className="hm-row-main">
                          <span className="hm-row-name">{b.isPrimary ? `${b.name} (${t.mainBranch})` : b.name}</span>
                          <span className="hm-row-sub">{t.branchMeta(b.bookingsToday, rupees(b.revenueTodayMinor))}</span>
                        </span>
                        {pace ? <span className={`hm-pace hm-pace-${pace}`}>{pace === 'busy' ? t.branchBusy : t.branchSlow}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card
            className={`hm-area-bookings ${multiBranch ? '' : 'hm-bookings-wide'}`}
            title={p.listIsTomorrow ? t.bookingsTomorrow : t.bookingsToday}
            action={
              <a className="hm-link" href="/appointments">
                {t.viewAll} ({groups.total}) ›
              </a>
            }
          >
            <div className="hm-fit-list" ref={fit.listRef}>
              {p.appointments === null ? (
                <CardError t={t} />
              ) : (
                <BookingRows t={t} groups={groups.shown} timezone={p.timezone} now={now} empty={p.listIsTomorrow ? t.nothingTomorrow : t.nothingToday} />
              )}
            </div>
          </Card>

          <Card className="hm-area-clients" title={t.clientsDoingTitle}>
            <SegmentCards t={t} stats={p.customerStats} />
          </Card>
        </div>
      </div>

      {summaryOpen ? (
        <DaySummarySheet
          t={t}
          locationId={branch}
          subtitle={[p.dateLabel, locationLine, afterClose && closeTime ? t.dayClosed(closeTime) : null].filter(Boolean).join(' · ')}
          onClose={() => setSummaryOpen(false)}
        />
      ) : null}
      {visitSheet ? <NewVisitSheet purpose={visitSheet} timezone={p.timezone} onClose={() => setVisitSheet(null)} /> : null}
    </>
  );
}

const BRANCH_TONES = ['green', 'blue', 'amber', 'violet', 'rose'] as const;

/** "MG Road" → "MG", "Koramangala" → "KO": the design's two-letter branch tile. */
function branchInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const letters = words.length > 1 ? words[0]!.charAt(0) + words[1]!.charAt(0) : name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2);
  return letters.toUpperCase();
}

/** "20:00" → "8:00 pm". */
function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
