'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type Appointment,
  type AutopayRenewal,
  type CustomerStats,
  type HomeOverview,
  type HomePeriod,
  type Provider,
  type QueueEntry,
  type TokenBoard as TokenBoardData,
} from '../../lib/api';
import { clientNameLabel, groupBookings, summarizeServices } from '../../lib/appointment-display';
import { liveState, minutesBetween } from '../../lib/live-state';
import { hasLiveWork, TokenBoard } from './TokenBoard';
import { useTokenWords } from './token-words';
import { atBranch } from '../../lib/right-now';
import { useBranch } from '../BranchProvider';
import { homeCopy } from '../../lib/home-copy';
import { closingTime } from '../../lib/day-summary-view';
import type { Lang } from '../../lib/lang';
import { canSee, mayUse, type MemberRole } from '../../lib/nav-policy';
import {
  IconAnalytics,
  IconBan,
  IconCalendarPlus,
  IconChat,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconDaySummary,
  IconOffers,
  IconPackages,
  IconReceipt,
  IconReports,
  IconServices,
  IconSettings,
  IconStaff,
} from '../icons';
import { NewVisitSheet } from '../NewVisitSheet';
import { AutopayRenewalNotice } from '../AutopayRenewalNotice';
import { DaySummarySheet } from './DaySummarySheet';
import { MoneyHero } from './MoneyHero';
import { AttentionList, BookingRows, Card, CardError, HomeHeader, QuickTiles, Segmented, SegmentCards } from './parts';
import { RightNow } from './RightNow';
import { useMinuteClock } from './useMinuteClock';

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
 * rows are the truth. So the picker and the "All branches" roll-up appear when
 * the business has more than one active branch, and a single-branch salon sees
 * neither — not a disabled picker with one entry in it.
 *
 * ## One laptop layout, with or without branches (Jira GRW-348 · GRW-351)
 *
 * The "Your branches" card is gone: the header's picker switches branches
 * (Jira GRW-395) and the money card's branch line names them. So a business
 * with branches lays out exactly as a single-branch one does — money and Needs
 * your attention on top, Bookings today and Right now beneath (1.5fr / 1fr, the
 * same split), How your clients are doing at the bottom. The grid names its
 * areas (83-role-home.css), so a new card is a new area, not a new layout.
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
 * of the page, in whole rows, one column wide (Right now has the other).
 */
const FIT_QUERY = '(min-width: 1101px) and (min-height: 680px)';

/**
 * Fit mode, and how many bookings the list's box holds.
 *
 * The box's height is decided by CSS (row 2 of the owner grid takes whatever
 * the money row leaves), so counting rows is a measurement, not a guess: whole
 * rows that fit.
 *
 * Jira GRW-225 — the measurement must never feed itself. The box sits in a
 * `minmax(0, 1fr)` row and clips, so the rows rendered from this count cannot
 * make the box taller; before, the first paint's six rows set the row's
 * min-content and every later measurement read six back.
 */
function useFitBookings() {
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
      const rowH = el?.querySelector<HTMLElement>('.hm-row')?.offsetHeight || 47;
      const rows = el ? Math.max(1, Math.floor(el.clientHeight / rowH)) : 1;
      setState((prev) => (prev.fit && prev.count === rows ? prev : { fit: true, count: rows }));
    };
    measure();
    mq.addEventListener('change', measure);
    const ro = el ? new ResizeObserver(measure) : null;
    if (el) ro!.observe(el);
    return () => {
      mq.removeEventListener('change', measure);
      ro?.disconnect();
    };
  }, []);
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
  /** Today's visits (the whole business's; Home narrows them to the branch it shows). */
  appointments: Appointment[] | null;
  /**
   * Tomorrow's. Bookings shows them once the branch Home is showing has closed for the day — which only the browser
   * knows, since the picked branch is kept there and a branch may close before the business does (Jira GRW-351).
   */
  tomorrowAppointments: Appointment[] | null;
  customerStats: CustomerStats | null;
  /** Null when the register could not be read; the card is then left out rather than shown as 0. */
  /** Jira GRW-477 — the provider ids, so the count follows the header's branch. */
  staffNotMarkedIn: string[] | null;
  /** Jira GRW-242 — owner only: approve the new AutoPay amount before the billing date. */
  autopayRenewal?: AutopayRenewal | null;
  /** Jira GRW-402 — whether Approve can open a page at all (usable payment keys, online payments on). */
  canPayOnline?: boolean;
  /**
   * Jira GRW-351 — today's walk-in queue, the whole business's (Home narrows it to the branch it shows). Null when
   * it could not be read: Right now then leaves its Walk-ins row out rather than showing 0.
   */
  queue: QueueEntry[] | null;
  /**
   * Jira GRW-418 — the day's tokens, so an owner who is their own front desk can see and work the queue.
   *
   * Null when it could not be read, and then the board is left out entirely rather than drawn empty: an
   * owner reading "nobody waiting" off a failed request is the mistake BR-12 already forbids for `queue`.
   */
  board: TokenBoardData | null;
  providers: Provider[];
}

export function OwnerHome(p: OwnerHomeProps) {
  const t = homeCopy(p.lang, p.labels);
  // Jira GRW-418 — the board's own words, the same ones the desk's Home gives it.
  const w = useTokenWords();
  // Jira GRW-351 — moves on once a minute, so an alert appears at its tenth minute without waiting for a reload.
  const now = useMinuteClock(p.nowISO);
  const [period, setPeriod] = useState<HomePeriod>('today');
  const branchContext = useBranch();
  /*
   * Jira GRW-351 — the branch Home shows is the header's choice, as soon as the browser has read it: not a copy made
   * when the overview arrives. A copy checked against `p.initial.branches` was never made at all when the overview
   * failed to load, so the lists showed every branch under a header naming one. One-branch businesses show "all",
   * which is the same thing.
   */
  const branch = branchContext.ready && branchContext.multi ? branchContext.choice : null;
  const [data, setData] = useState<HomeOverview | null>(p.initial);
  // Jira GRW-392 (review) — each branch keeps its own clients, so the client cards follow the branch Home shows.
  const [clientStats, setClientStats] = useState<CustomerStats | null>(p.customerStats);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(p.initial === null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  /**
   * Record payment only now — Jira GRW-297 moved "New booking" off this
   * overlay onto its own page (`/appointments/new`); Record payment is
   * unchanged and still opens here.
   */
  const [visitSheet, setVisitSheet] = useState<'payment' | null>(null);
  // Jira GRW-409 — the shared rule, not `role !== 'staff'`: each button is drawn for a role that may make its calls.
  const mayBook = mayUse(p.role, 'visit.new');
  const mayRecordPayment = mayUse(p.role, 'visit.recordPayment');

  const loadClientStats = (nextBranch: string | null) => {
    api
      .customerStats(nextBranch)
      .then(setClientStats)
      .catch(() => setClientStats(null));
  };

  const load = (nextPeriod: HomePeriod, nextBranch: string | null) => {
    setLoading(true);
    setFailed(false);
    api
      .home(nextPeriod, nextBranch)
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  /**
   * Jira GRW-340 — choose a branch from anywhere on this screen (the header's picker, the money card's branch line).
   * It is remembered for the session, so Bookings and Attendance open on the same branch.
   */
  const pickBranch = (next: string | null) => branchContext.setBranch(next);

  /*
   * Jira GRW-395 — Home shows the header's branch, and follows it whenever it changes: from the header or the
   * money card. Read after mount: the server render cannot see the browser's
   * storage, and starting on "All" there keeps the two renders identical. The figures are re-read for the branch;
   * the lists below are narrowed in the browser at once.
   */
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!branchContext.ready) return;
    if (branch === loadedFor.current) return;
    loadedFor.current = branch;
    load(period, branch);
    loadClientStats(branch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchContext.ready, branchContext.choice]);

  /** The overview Home holds is for the branch it shows (not one left from before a switch). */
  const dataIsForBranch = data !== null && (data.locationId ?? null) === branch;

  /*
   * Jira GRW-351 — no flash of every branch before the remembered one. The server draws "all" (it cannot see the
   * browser's storage), so for a business with branches the cards stay hidden until the browser knows the branch and,
   * if one is picked, its figures have arrived (or failed: then the card says so). Only the first time: a later
   * switch keeps the cards and dims the money card while it loads, as before.
   */
  const waitingForBranch = branchContext.multi && (!branchContext.ready || (!dataIsForBranch && data !== null && !failed));
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!waitingForBranch) setSettled(true);
  }, [waitingForBranch]);
  const hideUntilBranch = waitingForBranch && !settled;

  const branches = data?.branches ?? [];
  const multiBranch = branchContext.multi || branches.length > 1;
  const selected = branchContext.branches.find((b) => b.id === branch) ?? branches.find((b) => b.id === branch) ?? null;
  /*
   * Jira GRW-450 — more than one branch in view and none of them picked. Declared here because GRW-462 needs
   * it one line later; the closing time below reads the same value.
   */
  const onAllBranches = multiBranch && branch === null;

  // The hours of the branch Home shows (the API reads the branch's own), else the business's.
  const hours = (dataIsForBranch ? data.hoursToday : null) ?? p.initial?.hoursToday ?? null;
  /*
   * Jira GRW-462 — and on All branches, there is no answer to "is it closed".
   *
   * GRW-450 made this argument and fixed half of it. With no branch the API has no branch's hours to read and
   * falls back to the business-level `working_hours` row; branches set their own, so that row is a fact about
   * none of them. GRW-450 dropped the closing TIME on that basis and left the claim that follows from it
   * reading the same row — so past the business-level hour the header said "{Business} is closed for today"
   * of a business one of whose branches may still be serving.
   *
   * The sentence is the smaller half. `afterClose` also decides which day `Right now` lists, so it was
   * showing TOMORROW's bookings while a branch was still working today — not a claim to discount but the
   * wrong day's data on screen.
   */
  const afterClose = !onAllBranches && (hours?.afterClose ?? false);
  // After closing, the list that matters is tomorrow's (FR-09) — for the branch picked, by the branch's own hours.
  const listIsTomorrow = afterClose;

  const locationLine = multiBranch ? (selected?.name ?? t.allBranches) : p.primaryLocationName;

  const fit = useFitBookings();
  const bookingsShown = fit.count;

  const todayGroups = useMemo(() => visibleGroups(p.appointments, branch), [p.appointments, branch]);
  const tomorrowGroups = useMemo(() => visibleGroups(p.tomorrowAppointments, branch), [p.tomorrowAppointments, branch]);
  const queue = useMemo(() => (p.queue ? atBranch(p.queue, branch) : null), [p.queue, branch]);
  const listGroups = listIsTomorrow ? tomorrowGroups : todayGroups;

  const groups = useMemo(() => {
    const all = listGroups ?? [];
    // Anchor the window on now: one visit already under way, then what is next.
    const firstLive = all.findIndex((g) => new Date(g.endAt).getTime() > now.getTime());
    const from = listIsTomorrow || firstLive < 0 ? 0 : Math.max(0, firstLive - 1);
    return { shown: all.slice(from, from + bookingsShown), total: all.length };
  }, [listGroups, listIsTomorrow, now, bookingsShown]);

  /*
   * Jira GRW-418 — the queue, for an owner who is also the desk.
   *
   * Shown only when somebody is actually on the board. An empty board would cost the laptop Home its
   * one-screen fit (GRW-222) every day to say "nobody is waiting", which `Right now` already says in a
   * line; a board with a client on it is the one moment that is worth more than the tidiness.
   */
  const boardTokens = useMemo(
    () => (p.board?.tokens ?? []).filter((x) => !branch || x.locationId === branch),
    [p.board, branch],
  );
  // LIVE work only — see `hasLiveWork`. A board of paid tokens needs nobody and costs the one-screen fit.
  const showBoard = p.board !== null && hasLiveWork(boardTokens);

  /** providerId → who is in their chair, for the give sheet's free/busy pills. Same derivation the desk's Home makes. */
  const busy = useMemo(() => {
    const m = new Map<string, { client: string; min: number }>();
    for (const g of todayGroups ?? []) {
      if (liveState(g, now) !== 'in_service') continue;
      for (const a of g.appointments) {
        if (a.providerId && !m.has(a.providerId)) {
          m.set(a.providerId, { client: clientNameLabel(g) ?? summarizeServices(g.serviceNames, t.lang), min: minutesBetween(g.startAt, now) });
        }
      }
    }
    return m;
  }, [todayGroups, now, t.lang]);

  /*
   * Jira GRW-450 — no closing time while more than one branch is in view.
   *
   * With no branch the API has no branch's hours to read and falls back to the business-level `working_hours`
   * row. Branches set their own (`BRANCH_SETTING_KEYS`), so "Day closed at 8:00 pm" over three of them is a
   * fact about none: one may have shut at 7, another may still be serving. The Day summary is reached from the
   * header either way, so nothing becomes unreachable — only the claim goes.
   */
  const closesAt = closingTime(hours?.closesAt, onAllBranches);
  const closeTime = closesAt ? formatClock(closesAt) : null;

  /*
   * Jira GRW-312 — the count above was made for the branch picked here, so the link takes
   * that branch to Bookings. Without it the list opened across every branch and
   * disagreed with the number that led to it.
   */
  const unmarkedHref = `/appointments?status=confirmed&unmarked=1${branch ? `&location=${encodeURIComponent(branch)}` : ''}`;

  const attention = data
    ? [
        {
          key: 'unmarked',
          count: data.attention.notMarkedDone,
          label: t.notMarkedDone,
          sub: t.fromToday,
          tone: 'amber' as const,
          href: unmarkedHref,
          icon: <IconClock />,
        },
        {
          key: 'cancelled',
          count: data.attention.cancelledToday,
          label: t.cancelledTodayShort,
          sub: t.todayWord,
          tone: 'rose' as const,
          // Jira GRW-478 — the branch Home is showing, as the unmarked link already carries.
          href: `/appointments?status=cancelled${branch ? `&location=${encodeURIComponent(branch)}` : ''}`,
          icon: <IconBan />,
        },
        ...(p.staffNotMarkedIn !== null
          ? [
              {
                key: 'attendance',
                count: branch
                  ? p.staffNotMarkedIn.filter((id) => p.providers.find((x) => x.id === id)?.locationId === branch).length
                  : p.staffNotMarkedIn.length,
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
    // Jira GRW-438 — a quick link of its own, asked for alongside the screen.
    { href: '/packages', label: t.nav.packages, icon: <IconPackages />, tone: 'green' },
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
        locationName={multiBranch ? null : locationLine}
        dateLabel={p.dateLabel}
        onDaySummary={() => setSummaryOpen(true)}
      />

      <div className="page-body hm-page hm-fit">
        {p.autopayRenewal ? <AutopayRenewalNotice renewal={p.autopayRenewal} lang={p.lang} place="home" canApprove={p.canPayOnline ?? false} /> : null}
        {afterClose && closeTime ? (
          <button type="button" className="hm-closed hm-desktop" onClick={() => setSummaryOpen(true)}>
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
          {/* Jira GRW-313 — the period switch is on this row at every width now: on a phone it sat
              inside the money card, which made the card a row taller. */}
          <Segmented
            label={t.showMoneyFor}
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
          {/* Jira GRW-351 — on the one-screen laptop Home the "Day closed" banner is this chip instead: a banner row
              cost Right now the room for its rows (83-role-home.css). */}
          {afterClose && closeTime ? (
            <button type="button" className="hm-closed-chip" onClick={() => setSummaryOpen(true)}>
              <IconDaySummary />
              <span>{t.dayClosed(closeTime)}</span>
              <IconChevronRight />
            </button>
          ) : null}
          <div className="hm-toolbar-end">
            {mayBook || mayRecordPayment ? (
              /* One booking button, not "Walk-in" + "New appointment": New
                 booking's own page (GRW-297) has a toggle that chooses
                 now-or-later. "Record payment" is the walk-in steps ending
                 in the till, for a visit that has just finished — still an
                 overlay, unchanged. */
              <div className="hm-primary-actions hm-toolbar-actions hm-desktop">
                {mayRecordPayment ? (
                  <button type="button" className="hm-action" onClick={() => setVisitSheet('payment')}>
                    <IconReceipt />
                    <strong>{t.recordPayment}</strong>
                  </button>
                ) : null}
                {mayBook ? (
                  <a href="/appointments/new" className="hm-action hm-action-dark">
                    <IconCalendarPlus />
                    <strong>{t.nav.newBooking}</strong>
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
          {/* Jira GRW-306 — the Day summary on a phone: an icon beside the branch picker,
              on the row the period switch used to take. The "Day closed" banner that
              opened the same sheet is laptop-only now; it cost a phone a whole card of
              height. From 861px it is the header's button or the card's row. */}
          <button type="button" className="hm-toolbar-summary" aria-label={t.daySummary} title={t.daySummary} onClick={() => setSummaryOpen(true)}>
            <IconDaySummary />
          </button>
        </div>

        <div className={`hm-owner-grid ${hideUntilBranch ? 'is-settling' : ''}`} aria-busy={hideUntilBranch || undefined}>
          {/* The figures are the branch's; while a switch loads, the last ones stay, dimmed. A failed read says so. */}
          <div className="hm-area-hero">{data && (dataIsForBranch || !failed) ? <MoneyHero
                t={t}
                data={data}
                loading={loading || !dataIsForBranch}
                onDaySummary={() => setSummaryOpen(true)}
                unmarkedHref={unmarkedHref}
                branchId={branch}
                onPickBranch={pickBranch}
              /> : <CardError t={t} onRetry={() => load(period, branch)} />}</div>

          {/* The design gives "Needs your attention" to the laptop only; a phone's
              Home is money, shortcuts, clients and the day. */}
          <Card className="hm-area-attention hm-desktop" title={t.needsYourAttention}>
            {failed && !dataIsForBranch ? <CardError t={t} /> : <AttentionList items={attention} />}
          </Card>

          {/*
            Jira GRW-418 — who is waiting, and the desk's own controls for dealing with them.

            Every width, unlike `Right now` (which 83-role-home.css hides below 1101px): a salon owner
            standing at their own counter is holding a phone, and that was exactly the person who could
            not see a walk-in they had just added.
          */}
          {showBoard && (
            /* No heading and no `id` here: the board brings its own column titles and owns `#hm-queue`,
               which "N waiting over 10 minutes" in Needs your attention already links to. */
            <section className="hm-area-queue">
              <TokenBoard t={t} w={w} tokens={boardTokens} providers={p.providers} busy={busy} timezone={p.timezone} nowISO={p.nowISO} />
            </section>
          )}

          <Card className="hm-area-links hm-mobile" title={t.quickLinks}>
            <QuickTiles items={links} />
          </Card>

          <Card
            className="hm-area-bookings"
            title={listIsTomorrow ? t.bookingsTomorrow : t.bookingsToday}
            action={
              <a className="hm-link" href="/appointments">
                {t.viewAll} ({groups.total}) ›
              </a>
            }
          >
            <div className="hm-fit-list" ref={fit.listRef}>
              {listGroups === null ? (
                <CardError t={t} />
              ) : (
                <BookingRows t={t} groups={groups.shown} timezone={p.timezone} now={now} empty={listIsTomorrow ? t.nothingTomorrow : t.nothingToday} />
              )}
            </div>
          </Card>

          {/* Jira GRW-351 — laptop only; row 2 mirrors row 1. Its data is Bookings today's, so the two agree. */}
          <RightNow t={t} today={todayGroups} tomorrow={tomorrowGroups} queue={queue} now={now} afterClose={listIsTomorrow} timezone={p.timezone} />

          <Card className="hm-area-clients" title={t.clientsDoingTitle}>
            <SegmentCards t={t} stats={clientStats} branch={branch} />
          </Card>
        </div>
      </div>

      {summaryOpen ? (
        <DaySummarySheet
          t={t}
          locationId={branch}
          subtitle={[p.dateLabel, locationLine, afterClose && closeTime ? t.dayClosed(closeTime) : null].filter(Boolean).join(' · ')}
          dateLabel={p.dateLabel}
          onClose={() => setSummaryOpen(false)}
        />
      ) : null}
      {visitSheet ? <NewVisitSheet purpose={visitSheet} timezone={p.timezone} onClose={() => setVisitSheet(null)} /> : null}
    </>
  );
}

/**
 * A day's visits as Home lists them: the branch Home shows, grouped into sittings. Cancelled visits are counted in
 * Needs attention and listed on Bookings; on Home they would push the day's real work out of a six-row window.
 */
function visibleGroups(list: Appointment[] | null, branch: string | null) {
  return list ? groupBookings(atBranch(list, branch).filter((a) => a.status !== 'cancelled')) : null;
}

/** "20:00" → "8:00 pm". */
function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
