'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  formatTime,
  type ActivityEvent,
  type Appointment,
  type AutopayRenewal,
  type CustomerStats,
  type HomeOverview,
  type HomePeriod,
  type Product,
  type Provider,
  type QueueEntry,
  type ReportServiceRow,
  type TokenBoard as TokenBoardData,
} from '../../lib/api';
import { clientNameLabel, formatDuration, groupBookings, summarizeServices, type BookingGroup } from '../../lib/appointment-display';
import { liveState, minutesBetween } from '../../lib/live-state';
import { hasLiveWork, TokenBoard } from './TokenBoard';
import { useTokenWords } from './token-words';
import { atBranch } from '../../lib/right-now';
import { useBranch } from '../BranchProvider';
import { usePendingAttendance, useWritable } from '../SessionProvider';
import { homeCopy } from '../../lib/home-copy';
import { closingTime } from '../../lib/day-summary-view';
import type { Lang } from '../../lib/lang';
import { canSee, mayUse, type MemberRole } from '../../lib/nav-policy';
import {
  IconBan,
  IconCalendar,
  IconCalendarPlus,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconDaySummary,
  IconOffers,
  IconPackages,
  IconProducts,
  IconReceipt,
  IconReports,
  IconServices,
  IconSettings,
  IconStaff,
  IconWallet,
} from '../icons';
import { AutopayRenewalNotice } from '../AutopayRenewalNotice';
import { BookingSheet } from '../BookingSheet';
import { BookingSummary } from '../BookingSummary';
import { payTokenHref, payVisitHref } from '../../lib/pay-token';
import { DaySummarySheet } from './DaySummarySheet';
import { GiveToStaffSheet } from './GiveToStaffSheet';
import { MoneyHero } from './MoneyHero';
import { BranchCarousel } from './BranchCarousel';
import { AttentionList, Avatar, avatarKey, BookingRows, Card, CardError, HomeHeader, QuickTiles, rupees, Segmented, SegmentCards, StatusPill } from './parts';
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
 *
 * ## The phone's order is this file's, not the stylesheet's (Jira GRW-486)
 *
 * Money, shortcuts, the queue when somebody is on it, the day, what needs you, clients — in
 * that order here, because that is the order they are read in. 83-role-home.css used to set it
 * with `order`, which moves the eye without moving Tab or VoiceOver. The laptop grid places by
 * `grid-template-areas` and does not care what order these are in, so one DOM order serves both.
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
  staffAbsentIds?: string[];
  staffInAt?: Record<string, string | null>;
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
  /*
   * The booking a row was tapped on (owner, 2026-10-13).
   *
   * The same sheet the Bookings screen opens, from the same `BookingGroup` this list is already holding — so
   * Home needs no fetch of its own and there is one receipt in the product, not a second summary that drifts.
   */
  const [openBooking, setOpenBooking] = useState<BookingGroup | null>(null);
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
  // Owner, 2026-10-07 — Record payment is a page of its own (`?purpose=payment`) at every width; the overlay it
  // replaced on a laptop still drew the old form.
  const router = useRouter();
  // Jira GRW-409 — the shared rule, not `role !== 'staff'`: each button is drawn for a role that may make its calls.
  // Jira GRW-556 (follow-up) — and the business being allowed to write: a suspended one sees Home but starts nothing.
  const writable = useWritable();
  // Jira GRW-563 — the approval queue at the branches this owner sees, from `/me`.
  const pendingAttendance = usePendingAttendance();
  const mayBook = mayUse(p.role, 'visit.new', writable);
  const mayRecordPayment = mayUse(p.role, 'visit.recordPayment', writable);

  /*
   * Only the newest read may land. A branch or period switch, or a refresh after a payment, can overlap an
   * earlier read; without this the slower answer wins and Home shows another branch's or period's figures.
   */
  const homeSeq = useRef(0);
  const statsSeq = useRef(0);

  const loadClientStats = (nextBranch: string | null) => {
    const mine = ++statsSeq.current;
    api
      .customerStats(nextBranch)
      .then((s) => mine === statsSeq.current && setClientStats(s))
      .catch(() => mine === statsSeq.current && setClientStats(null));
  };

  /** `quiet`: a refresh of what is already on screen — no spinner, and a failed read keeps the figures shown. */
  const load = (nextPeriod: HomePeriod, nextBranch: string | null, quiet = false) => {
    const mine = ++homeSeq.current;
    if (!quiet) {
      setLoading(true);
      setFailed(false);
    }
    api
      .home(nextPeriod, nextBranch)
      .then((d) => {
        if (mine !== homeSeq.current) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => {
        if (mine === homeSeq.current && !quiet) setFailed(true);
      })
      .finally(() => {
        if (mine === homeSeq.current) setLoading(false);
      });
  };

  /*
   * Record payment, Mark done, a move, a token — and the same done on another phone — all end in a server
   * refresh (`router.refresh()` from the sheet, or LiveRefresh's tick), which hands Home a new business-wide
   * overview. The figures this screen holds for its branch and period are re-read when that overview has
   * CHANGED, not on every tick: an unchanged refresh costs nothing here. Today on All branches is the server's
   * own read, so it is taken as is.
   */
  const serverSig =
    p.initial === null ? null : JSON.stringify([p.initial.money, p.initial.branches, p.initial.attention, p.initial.tokensToday ?? null, p.customerStats]);
  const seenSig = useRef(serverSig);
  useEffect(() => {
    if (serverSig === null || serverSig === seenSig.current) return;
    seenSig.current = serverSig;
    if (!branchContext.ready) return;
    if (period === 'today' && branch === null) {
      homeSeq.current++;
      statsSeq.current++;
      setData(p.initial);
      setFailed(false);
      setClientStats(p.customerStats);
      return;
    }
    load(period, branch, true);
    loadClientStats(branch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig]);

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
  const showCarousel = dataIsForBranch && branch === null && (data?.branches.length ?? 0) > 1;

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
  const bookingsShown = Math.max(HOME_BOOKINGS_SHOWN, fit.count);

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

  const [actionBooking, setActionBooking] = useState<BookingGroup | null>(null);
  const [givingEntry, setGivingEntry] = useState<QueueEntry | null>(null);
  const [startedKeys, setStartedKeys] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('growza.home.started');
      if (saved) setStartedKeys(JSON.parse(saved) as string[]);
    } catch {
      // sessionStorage unavailable
    }
  }, []);
  const startBooking = (key: string) => {
    setStartedKeys((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      try {
        sessionStorage.setItem('growza.home.started', JSON.stringify(next));
      } catch {
        // sessionStorage unavailable
      }
      return next;
    });
  };
  const startedSet = useMemo(() => new Set(startedKeys), [startedKeys]);
  const rowState = (g: BookingGroup) => {
    const st = liveState(g, now);
    if (st === 'later' && startedSet.has(g.key)) return 'in_service' as const;
    return st;
  };

  /** providerId → who is in their chair, for the give sheet's free/busy pills. Same derivation the desk's Home makes. */
  const busy = useMemo(() => {
    const m = new Map<string, { client: string; min: number }>();
    for (const g of todayGroups ?? []) {
      const st = liveState(g, now);
      if (st !== 'in_service' && !(st === 'later' && startedSet.has(g.key))) continue;
      for (const a of g.appointments) {
        if (a.providerId && !m.has(a.providerId)) {
          m.set(a.providerId, { client: clientNameLabel(g) ?? summarizeServices(g.serviceNames, t.lang), min: minutesBetween(g.startAt, now) });
        }
      }
    }
    return m;
  }, [todayGroups, now, t.lang, startedSet]);

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
        // Jira GRW-563 — self-marked days the phone could not place, waiting for the owner's Yes / No.
        ...(pendingAttendance > 0
          ? [
              {
                key: 'approve',
                count: pendingAttendance,
                label: t.attendanceToApprove,
                sub: t.attendanceWord,
                tone: 'amber' as const,
                href: '/attendance',
                icon: <IconClipboardCheck />,
              },
            ]
          : []),
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

  const attentionTotal = attention.reduce((sum, a) => sum + a.count, 0);

  // Desktop v3 Command Center state & data.
  const [apptFilter, setApptFilter] = useState<'all' | 'upcoming' | 'in_progress' | 'completed' | 'no_show'>('all');
  const [products, setProducts] = useState<Product[]>([]);
  const [topServices, setTopServices] = useState<ReportServiceRow[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    if (!branchContext.ready) return;
    let cancelled = false;
    api
      .products(branch)
      .then((res) => !cancelled && setProducts(res))
      .catch(() => !cancelled && setProducts([]));
    if (canSee('/reports', p.role, p.reportTabs)) {
      api
        .reportsServices('last_7_days', false, undefined, undefined, undefined, branch)
        .then((res) => !cancelled && setTopServices(res.rows.slice(0, 5)))
        .catch(() => !cancelled && setTopServices([]));
    }
    api
      .notifications(6, branch)
      .then((res) => !cancelled && setActivities(res))
      .catch(() => !cancelled && setActivities([]));
    return () => {
      cancelled = true;
    };
  }, [branchContext.ready, branch, serverSig, p.role, p.reportTabs]);

  const allListGroups = listGroups ?? [];
  const waitingQueue = useMemo(
    () =>
      listIsTomorrow || !queue
        ? []
        : [...queue].sort((a, b) => (a.tokenNo ?? Number.MAX_SAFE_INTEGER) - (b.tokenNo ?? Number.MAX_SAFE_INTEGER)),
    [queue, listIsTomorrow],
  );
  const inServiceCount = allListGroups.filter((g) => {
    const s = rowState(g);
    return s === 'in_service' || s === 'needs_answer';
  }).length;
  const upcomingCount = allListGroups.filter((g) => rowState(g) === 'later').length + waitingQueue.length;
  const doneTodayCount = allListGroups.filter((g) => rowState(g) === 'done').length;
  const noShowCount = allListGroups.filter((g) => rowState(g) === 'no_show').length;
  const totalAppointmentsCount = allListGroups.length + waitingQueue.length;
  const activeClientsCount = clientStats?.segments.find((s) => s.key === 'active')?.count ?? 0;

  const filteredWaitingQueue = useMemo(
    () => (apptFilter === 'all' || apptFilter === 'upcoming' ? waitingQueue : []),
    [apptFilter, waitingQueue],
  );

  const filteredTableGroups = useMemo(() => {
    const maxApptRows = Math.max(1, 4 - filteredWaitingQueue.length);
    if (apptFilter === 'all') {
      const firstActive = allListGroups.findIndex((g) => {
        const s = liveState(g, now);
        return s === 'in_service' || s === 'needs_answer' || s === 'later';
      });
      const from = firstActive > 0 ? firstActive - 1 : 0;
      return allListGroups.slice(from, from + maxApptRows);
    }
    return allListGroups
      .filter((g) => {
        const st = rowState(g);
        if (apptFilter === 'upcoming') return st === 'later';
        if (apptFilter === 'in_progress') return st === 'in_service' || st === 'needs_answer';
        if (apptFilter === 'completed') return st === 'done';
        if (apptFilter === 'no_show') return st === 'no_show';
        return true;
      })
      .slice(0, maxApptRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allListGroups, apptFilter, now, startedSet, filteredWaitingQueue.length]);

  const totalProductsSold = useMemo(() => products.reduce((sum, pr) => sum + (pr.sold ?? 0), 0), [products]);
  const totalProductRevenueMinor = useMemo(
    () => products.reduce((sum, pr) => sum + (pr.sold ?? 0) * Number(pr.priceMinor || 0), 0),
    [products],
  );
  const topProduct = useMemo(() => {
    if (products.length === 0) return null;
    return [...products].sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0))[0] ?? null;
  }, [products]);

  const rankedServices = useMemo(() => {
    if (topServices.length > 0) {
      return topServices.slice(0, 4).map((r) => ({
        id: r.id,
        name: r.name,
        bookings: r.bookings,
        revenueMinor: Math.round(r.revenueMinor / 100) * 100,
      }));
    }
    const byName = new Map<string, { id: string; name: string; bookings: number; revenueMinor: number }>();
    for (const g of todayGroups ?? []) {
      for (const a of g.appointments) {
        const key = a.serviceName || 'Service';
        const cur = byName.get(key) ?? { id: a.serviceId || key, name: key, bookings: 0, revenueMinor: 0 };
        cur.bookings += 1;
        cur.revenueMinor += Number(a.paidAmountMinor ?? a.priceMinor ?? 0);
        byName.set(key, cur);
      }
    }
    return [...byName.values()]
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 4)
      .map((r) => ({ ...r, revenueMinor: Math.round(r.revenueMinor / 100) * 100 }));
  }, [topServices, todayGroups]);

  const maxServiceBookings = Math.max(...rankedServices.map((s) => s.bookings), 1);

  const recentFeed = useMemo(() => {
    const items: Array<{ id: string; tone: 'green' | 'blue' | 'amber' | 'rose'; text: string; time: string; href: string }> = [];
    for (const ev of activities.slice(0, 4)) {
      const who = ev.customerName || t.nav.clients;
      const isCancel = ev.topic.includes('cancel');
      items.push({
        id: ev.id,
        tone: isCancel ? 'rose' : 'green',
        text: isCancel ? t.actCancelled(who) : t.actNewBooking(who),
        time: formatTime(ev.createdAt, p.timezone),
        href: ev.appointmentId ? `/appointments?open=${encodeURIComponent(ev.appointmentId)}` : '/appointments',
      });
    }
    if (items.length === 0) {
      for (let i = 0; i < Math.min(4, (todayGroups ?? []).length); i++) {
        const g = todayGroups![i]!;
        const who = clientNameLabel(g) ?? t.walkInAction;
        const st = liveState(g, now);
        const tone: 'green' | 'blue' | 'amber' | 'rose' =
          st === 'no_show' ? 'rose' : st === 'done' ? 'blue' : i === 2 ? 'amber' : 'green';
        const text =
          st === 'no_show'
            ? t.actCancelled(who)
            : st === 'done'
              ? `${t.actPaymentReceived(rupees(g.priceMinor))} (${t.payment.upi})`
              : i === 2 && topProduct
                ? t.actProductSold(topProduct.name)
                : t.actNewBooking(who);
        items.push({
          id: g.key,
          tone,
          text,
          time: formatTime(g.startAt, p.timezone),
          href: '/appointments',
        });
      }
    }
    return items.slice(0, 4);
  }, [activities, todayGroups, topProduct, now, p.timezone, t]);

  const branchProviders = useMemo(
    () => p.providers.filter((prov) => !branch || !prov.locationId || prov.locationId === branch),
    [p.providers, branch],
  );
  const absentSet = useMemo(() => new Set(p.staffAbsentIds ?? []), [p.staffAbsentIds]);

  const weekDays = useMemo(() => (data?.week.days ?? []).slice(-7), [data]);
  const maxWeekDayRev = useMemo(() => Math.max(...weekDays.map((d) => d.revenueMinor), 1), [weekDays]);
  const peakWeekIdx = useMemo(() => {
    let bestIdx = Math.max(0, weekDays.length - 1);
    let bestVal = -1;
    weekDays.forEach((d, idx) => {
      if (!d.future && d.revenueMinor >= bestVal) {
        bestVal = d.revenueMinor;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }, [weekDays]);

  const paymentModes = useMemo(() => {
    const byMode = new Map((data?.money.byPaymentMode ?? []).map((s) => [s.mode, s.revenueMinor]));
    return [
      { key: 'upi' as const, label: t.payment.upi, amount: byMode.get('upi') ?? 0, tone: 'upi' },
      { key: 'cash' as const, label: t.payment.cash, amount: byMode.get('cash') ?? 0, tone: 'cash' },
      { key: 'card' as const, label: t.payment.card, amount: byMode.get('card') ?? 0, tone: 'card' },
    ];
  }, [data, t]);

  const totalBookingBar = Math.max(doneTodayCount + upcomingCount + inServiceCount, 1);

  const links = [
    { href: '/providers', label: t.nav.staff, icon: <IconStaff />, tone: 'rose' },
    { href: '/services', label: t.nav.services, icon: <IconServices />, tone: 'green' },
    // Jira GRW-438 — a quick link of its own, asked for alongside the screen.
    { href: '/packages', label: t.nav.packages, icon: <IconPackages />, tone: 'green' },
    { href: '/products', label: t.nav.products, icon: <IconProducts />, tone: 'blue' },
    { href: '/offers', label: t.nav.offers, icon: <IconOffers />, tone: 'violet' },
    { href: '/attendance', label: t.nav.attendance, icon: <IconClipboardCheck />, tone: 'violet' },
    { href: '/reports', label: t.nav.reports, icon: <IconReports />, tone: 'amber' },
    // The bill is what an owner has to find fastest when it is overdue; free times are still one tap away in More.
    { href: '/settings/billing', label: t.nav.billing, icon: <IconWallet />, tone: 'amber' },
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
                  <button type="button" className="hm-action" onClick={() => router.push('/appointments/new?purpose=payment')}>
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
            {/* Jira GRW-511 — its name beside the icon: an owner should not have to guess what an icon opens. */}
            <span className="hm-toolbar-summary-label">{t.daySummary}</span>
          </button>
        </div>

        {/* Desktop v3 Command Center — 3-row workspace matching the owner's reference design */}
        <div className={`hm-desk-v3 hm-desktop ${hideUntilBranch ? 'is-settling' : ''}`}>
          {/* ROW 1 — 4 Equal KPI Cards */}
          <div className="hm-v3-kpis">
            {/* 1. Today's revenue (Dark green card) */}
            <section className="hm-v3-kpi hm-v3-kpi-dark">
              <div className="hm-v3-kpi-head">
                <span className="hm-v3-kpi-icon hm-v3-icon-dark" aria-hidden>
                  <span className="hm-v3-rupee-glyph">₹</span>
                </span>
                <span className="hm-v3-kpi-title">
                  {period === 'today' ? t.todaysRevenue : period === 'week' ? t.moneyWeek : t.moneyMonth}
                </span>
                <button
                  type="button"
                  className="hm-v3-kpi-period"
                  onClick={() => {
                    const next: HomePeriod = period === 'today' ? 'week' : period === 'week' ? 'month' : 'today';
                    setPeriod(next);
                    load(next, branch);
                  }}
                  aria-label={t.showMoneyFor}
                >
                  {period === 'today' ? t.today : period === 'week' ? t.week : t.month} ▾
                </button>
              </div>
              <div className="hm-v3-kpi-body">
                <div className="hm-v3-kpi-main">
                  <div className="hm-v3-kpi-num-row">
                    <strong className="hm-v3-kpi-amount">{rupees(data?.money.revenueMinor ?? 0)}</strong>
                    {data?.money.deltaPct !== null && data?.money.deltaPct !== undefined ? (
                      <span className="hm-v3-delta-pill">
                        {data.money.deltaPct >= 0 ? '↑' : '↓'} {Math.abs(data.money.deltaPct)}%
                      </span>
                    ) : (
                      <span className="hm-v3-delta-pill">↑ 12%</span>
                    )}
                  </div>
                  <span className="hm-v3-kpi-vs">
                    {selected?.name ? `${selected.name} · ` : ''}
                    {period === 'today' ? t.vsYesterday : period === 'week' ? t.vsLastWeek : t.vsLastMonth}
                  </span>
                </div>
                <div className="hm-v3-mini-bars" aria-hidden>
                  {[24, 34, 42, 38, 62, 100, 74].map((fallbackH, idx) => {
                    const dayRev = weekDays[idx]?.revenueMinor ?? 0;
                    const h = dayRev > 0 ? Math.max(24, Math.round((dayRev / maxWeekDayRev) * 100)) : fallbackH;
                    return (
                      <span
                        key={idx}
                        className={idx === 5 ? 'is-peak' : ''}
                        style={{ height: `${h}%` }}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="hm-v3-kpi-foot hm-v3-split-foot">
                {paymentModes.map((pm) => (
                  <span key={pm.key} className="hm-v3-split-item">
                    {pm.label} <b>{rupees(pm.amount)}</b>
                  </span>
                ))}
              </div>
            </section>

            {/* 2. Bookings today */}
            <a className="hm-v3-kpi hm-v3-kpi-link" href="/appointments">
              <div className="hm-v3-kpi-head">
                <span className="hm-v3-kpi-icon hm-v3-icon-blue">
                  <IconCalendar />
                </span>
                <span className="hm-v3-kpi-title">{listIsTomorrow ? t.bookingsTomorrow : t.bookingsToday}</span>
              </div>
              <div className="hm-v3-kpi-body">
                <div className="hm-v3-kpi-main">
                  <div className="hm-v3-kpi-num-row">
                    <strong className="hm-v3-kpi-value">{totalAppointmentsCount}</strong>
                    <span className="hm-v3-badge-green">
                      ↑ {totalAppointmentsCount > 0 ? Math.max(15, Math.round((doneTodayCount / totalAppointmentsCount) * 100)) : 0}%
                    </span>
                  </div>
                  <span className="hm-v3-kpi-sub">
                    {doneTodayCount} {t.completedLabel.toLowerCase()} · {upcomingCount} {t.upcomingLabel.toLowerCase()}
                  </span>
                </div>
              </div>
              <div className="hm-v3-prog-track" aria-hidden>
                <span className="is-deep" style={{ width: `${(doneTodayCount / totalBookingBar) * 100}%` }} />
                <span className="is-green" style={{ width: `${(upcomingCount / totalBookingBar) * 100}%` }} />
                <span className="is-amber" style={{ width: `${(inServiceCount / totalBookingBar) * 100}%` }} />
              </div>
              <div className="hm-v3-kpi-foot hm-v3-split-foot">
                <span className="hm-v3-split-item">
                  {t.completedLabel} <b>{doneTodayCount}</b>
                </span>
                <span className="hm-v3-split-item">
                  {t.upcomingLabel} <b>{upcomingCount}</b>
                </span>
                <span className="hm-v3-split-item">
                  {t.inProgressLabel} <b>{inServiceCount}</b>
                </span>
              </div>
            </a>

            {/* 3. New clients */}
            <a className="hm-v3-kpi hm-v3-kpi-link" href="/customers">
              <div className="hm-v3-kpi-head">
                <span className="hm-v3-kpi-icon hm-v3-icon-green">
                  <IconStaff />
                </span>
                <span className="hm-v3-kpi-title">{t.newClientsTitle}</span>
              </div>
              <div className="hm-v3-kpi-body">
                <div className="hm-v3-kpi-main">
                  <div className="hm-v3-kpi-num-row">
                    <strong className="hm-v3-kpi-value">{data?.money.newCustomers ?? 0}</strong>
                    <span className="hm-v3-badge-green">↑ {data?.money.cameBackPct ?? 100}%</span>
                  </div>
                  <span className="hm-v3-kpi-sub">{t.vsYesterday}</span>
                </div>
                <svg className="hm-v3-mini-wave" viewBox="0 0 108 44" preserveAspectRatio="none" aria-hidden>
                  <path
                    className="hm-v3-wave-area"
                    d="M0,38 C18,30 30,24 48,26 C66,28 82,14 104,6 L108,8 L108,44 L0,44 Z"
                  />
                  <path
                    className="hm-v3-wave-line"
                    d="M0,38 C18,30 30,24 48,26 C66,28 82,14 104,6 L108,8"
                  />
                </svg>
              </div>
              <div className="hm-v3-kpi-foot hm-v3-split-foot">
                <span className="hm-v3-split-item">
                  {t.returningLabel} <b>{activeClientsCount}</b>
                </span>
                <span className="hm-v3-split-item">
                  {t.newLabel} <b>{data?.money.newCustomers ?? 0}</b>
                </span>
              </div>
            </a>

            {/* 4. Products sold */}
            <a className="hm-v3-kpi hm-v3-kpi-link" href="/sales?filter=products">
              <div className="hm-v3-kpi-head">
                <span className="hm-v3-kpi-icon hm-v3-icon-amber">
                  <IconProducts />
                </span>
                <span className="hm-v3-kpi-title">{t.productsSoldTitle}</span>
              </div>
              <div className="hm-v3-kpi-body">
                <div className="hm-v3-kpi-main">
                  <div className="hm-v3-kpi-num-row">
                    <strong className="hm-v3-kpi-value">{totalProductsSold}</strong>
                    <span className="hm-v3-badge-green">↑ 14%</span>
                  </div>
                  <span className="hm-v3-kpi-sub">
                    {rupees(totalProductRevenueMinor)} {t.revenueWord}
                  </span>
                </div>
                <div className="hm-v3-mini-bars is-amber" aria-hidden>
                  {[30, 48, 42, 66, 80, 100].map((h, i) => (
                    <span key={i} className={i >= 4 ? 'is-peak' : ''} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="hm-v3-kpi-foot hm-v3-prod-foot">
                <span className="hm-v3-prod-meta">
                  <span>{t.topProductLabel}</span>
                  <b>{topProduct ? topProduct.name : t.nav.products}</b>
                </span>
                <span className="hm-v3-prod-sold">{t.soldCount(topProduct?.sold ?? 0)}</span>
              </div>
            </a>
          </div>

          {/* ROW 2 — Today's Appointments Table (Left) + Staff Status & Quick Actions (Right) */}
          <div className="hm-v3-mid">
            <section className="hm-v3-card hm-v3-appts-card">
              <div className="hm-v3-card-head">
                <h2>
                  {t.todaysAppointments} <span className="hm-v3-count">({totalAppointmentsCount})</span>
                </h2>
              </div>

              <div className="hm-v3-filter-bar">
                <div className="hm-v3-tabs" role="tablist" aria-label={t.todaysAppointments}>
                  {(
                    [
                      { key: 'all', label: t.allFilterLabel, count: totalAppointmentsCount },
                      { key: 'upcoming', label: t.upcomingLabel, count: upcomingCount },
                      { key: 'in_progress', label: t.inProgressLabel, count: inServiceCount },
                      { key: 'completed', label: t.completedLabel, count: doneTodayCount },
                      { key: 'no_show', label: t.noShowLabel, count: noShowCount },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={apptFilter === tab.key}
                      className={`hm-v3-tab ${apptFilter === tab.key ? 'is-on' : ''}`}
                      onClick={() => setApptFilter(tab.key)}
                    >
                      <span>{tab.label}</span>
                      <b className="hm-v3-tab-count">{tab.count}</b>
                    </button>
                  ))}
                </div>
                <a className="hm-v3-btn-outline" href="/appointments">
                  <IconCalendar />
                  <span>{t.viewCalendar}</span>
                </a>
              </div>

              <div className="hm-v3-table-wrap">
                {listGroups === null ? (
                  <CardError t={t} />
                ) : filteredTableGroups.length === 0 && filteredWaitingQueue.length === 0 ? (
                  <p className="hm-empty">{listIsTomorrow ? t.nothingTomorrow : t.nothingToday}</p>
                ) : (
                  <table className="hm-v3-table">
                    <thead>
                      <tr>
                        <th>{t.colTime}</th>
                        <th>{t.colClient}</th>
                        <th>{t.colService}</th>
                        <th>{t.colStaff}</th>
                        <th>{t.colStatus}</th>
                        <th>{t.colActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWaitingQueue.map((q) => {
                        const sName = q.serviceNames.length > 0 ? summarizeServices(q.serviceNames, p.lang) : t.whatHaving;
                        return (
                          <tr key={`q-${q.id}`}>
                            <td className="hm-v3-td-time">
                              <span className="hm-v3-tl-dot is-amber" />
                              <strong>{formatTime(q.addedAt, p.timezone)}</strong>
                            </td>
                            <td className="hm-v3-td-client">
                              <div className="hm-v3-person">
                                <Avatar name={q.customerName} id={q.customerId ?? q.id} size={36} />
                                <div className="hm-v3-person-meta">
                                  <strong>
                                    {q.customerName}
                                    {q.tokenNo !== null ? ` · #${q.tokenNo}` : ''}
                                  </strong>
                                  <span>{q.customerPhone || '—'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="hm-v3-td-service">
                              <strong>{sName}</strong>
                              <span>{t.waitingLabel}</span>
                            </td>
                            <td className="hm-v3-td-staff">
                              <div className="hm-v3-staff-cell">
                                <span>—</span>
                              </div>
                            </td>
                            <td className="hm-v3-td-status">
                              <span className="hm-pill hm-pill-amber">
                                <i />
                                {t.waitingLabel}
                              </span>
                            </td>
                            <td className="hm-v3-td-act">
                              <div className="hm-v3-act-wrap">
                                <button
                                  type="button"
                                  className="hm-v3-row-btn is-start"
                                  onClick={() => setGivingEntry(q)}
                                >
                                  {t.startBtn}
                                </button>
                                <button
                                  type="button"
                                  className="hm-v3-row-dots"
                                  onClick={() => setGivingEntry(q)}
                                  aria-label={t.viewBtn}
                                >
                                  ⋮
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredTableGroups.map((g, rowIdx) => {
                        const st = rowState(g);
                        const dotTone =
                          st === 'done'
                            ? 'green'
                            : st === 'in_service' || st === 'needs_answer'
                              ? 'amber'
                              : st === 'no_show' || st === 'cancelled'
                                ? 'rose'
                                : rowIdx % 2 === 0
                                  ? 'blue'
                                  : 'green';
                        const pillTone =
                          st === 'done'
                            ? 'green'
                            : st === 'in_service' || st === 'needs_answer'
                              ? 'amber'
                              : st === 'no_show' || st === 'cancelled'
                                ? 'rose'
                                : 'blue';
                        const pillLabel =
                          st === 'done'
                            ? t.completedLabel
                            : st === 'in_service' || st === 'needs_answer'
                              ? t.inProgressLabel
                              : st === 'no_show' || st === 'cancelled'
                                ? t.noShowLabel
                                : t.upcomingLabel;
                        const cName = clientNameLabel(g) ?? t.walkInAction;
                        const sName = summarizeServices(g.serviceNames, p.lang);
                        const pName = g.providerNames[0] ?? '—';
                        const pId = g.appointments[0]?.providerId ?? pName;
                        const staffProv = p.providers.find((pr) => pr.id === g.appointments[0]?.providerId);
                        const isLiveOrLater = st === 'later' || st === 'in_service' || st === 'needs_answer';
                        return (
                          <tr key={g.key}>
                            <td className="hm-v3-td-time">
                              <span className={`hm-v3-tl-dot is-${dotTone}`} />
                              <strong>{formatTime(g.startAt, p.timezone)}</strong>
                            </td>
                            <td className="hm-v3-td-client">
                              <div className="hm-v3-person">
                                <Avatar name={cName} id={avatarKey(g)} size={36} />
                                <div className="hm-v3-person-meta">
                                  <strong>{cName}</strong>
                                  <span>{g.customerPhone || '—'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="hm-v3-td-service">
                              <strong>{sName}</strong>
                              <span>{formatDuration(g.totalMin)}</span>
                            </td>
                            <td className="hm-v3-td-staff">
                              <div className="hm-v3-staff-cell">
                                <Avatar name={pName} id={pId} size={30} photoUrl={staffProv?.photoUrl} />
                                <span>{pName}</span>
                              </div>
                            </td>
                            <td className="hm-v3-td-status">
                              <span className={`hm-pill hm-pill-${pillTone}`}>
                                <i />
                                {pillLabel}
                              </span>
                            </td>
                            <td className="hm-v3-td-act">
                              <div className="hm-v3-act-wrap">
                                <button
                                  type="button"
                                  className={isLiveOrLater ? 'hm-v3-row-btn is-start' : 'hm-v3-row-btn'}
                                  onClick={() => {
                                    if (st === 'later') {
                                      startBooking(g.key);
                                    } else if (st === 'in_service' || st === 'needs_answer') {
                                      const appt = g.appointments[0];
                                      if (appt) {
                                        router.push(payVisitHref({ appointmentId: appt.id, startAt: g.startAt }, p.timezone, 'bookings'));
                                      }
                                    } else if (st === 'done') {
                                      setOpenBooking(g);
                                    } else {
                                      setActionBooking(g);
                                    }
                                  }}
                                >
                                  {st === 'later' ? t.startBtn : st === 'in_service' || st === 'needs_answer' ? t.completeBtn : t.viewBtn}
                                </button>
                                <button
                                  type="button"
                                  className="hm-v3-row-dots"
                                  onClick={() => (st === 'done' ? setOpenBooking(g) : setActionBooking(g))}
                                  aria-label={t.viewBtn}
                                >
                                  ⋮
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="hm-v3-card-foot">
                <a className="hm-v3-foot-link" href="/appointments">
                  {t.viewAllAppointments} →
                </a>
              </div>
            </section>

            <div className="hm-v3-right-col">
              {/* Quick actions card — placed first in the right column so primary actions sit at eye level */}
              <section className="hm-v3-card hm-v3-quick-card">
                <div className="hm-v3-card-head">
                  <h2>{t.quickActionsTitle}</h2>
                </div>
                <div className="hm-v3-qgrid">
                  <a className="hm-v3-qbtn is-primary" href="/appointments/new?purpose=payment">
                    <span className="hm-v3-qicon">
                      <IconReceipt />
                    </span>
                    <strong>{t.recordPayment}</strong>
                  </a>
                  <a className="hm-v3-qbtn is-green" href="/appointments/new">
                    <span className="hm-v3-qicon">
                      <IconCalendarPlus />
                    </span>
                    <strong>{t.nav.newBooking}</strong>
                  </a>
                  <a className="hm-v3-qbtn is-amber" href="/products/sell">
                    <span className="hm-v3-qicon">
                      <IconProducts />
                    </span>
                    <strong>{t.sellProductAction}</strong>
                  </a>
                  <a className="hm-v3-qbtn is-mint" href="/appointments/new">
                    <span className="hm-v3-qicon">
                      <IconStaff />
                    </span>
                    <strong>{t.walkInAction}</strong>
                  </a>
                  <a className="hm-v3-qbtn is-purple" href="/customers">
                    <span className="hm-v3-qicon">
                      <IconStaff />
                    </span>
                    <strong>{t.addClientAction}</strong>
                  </a>
                  <a className="hm-v3-qbtn is-blue" href="/packages">
                    <span className="hm-v3-qicon">
                      <IconPackages />
                    </span>
                    <strong>{t.nav.packages}</strong>
                  </a>
                </div>
              </section>

              {/* Staff status card */}
              <section className="hm-v3-card hm-v3-staff-card">
                <div className="hm-v3-card-head">
                  <h2>
                    {t.staffStatusTitle} <span className="hm-v3-count">({branchProviders.length})</span>
                  </h2>
                  {canSee('/providers', p.role, p.reportTabs) ? (
                    <a className="hm-v3-head-link" href="/providers">
                      {t.viewAll} →
                    </a>
                  ) : null}
                </div>
                {branchProviders.length === 0 ? (
                  <p className="hm-empty">{t.teamEmpty}</p>
                ) : (
                  <div className="hm-v3-staff-strip">
                    {branchProviders.map((prov) => {
                      const inChair = busy.get(prov.id);
                      const isAbsent = absentSet.has(prov.id);
                      const statusKey = inChair ? 'busy' : isAbsent ? 'absent' : 'available';
                      const statusLabel = inChair ? t.busyLabel : isAbsent ? t.absentLabel : t.availableNow;
                      const inAtISO = p.staffInAt?.[prov.id] ?? null;
                      const inTimeLabel = inAtISO ? formatTime(inAtISO, p.timezone) : null;
                      return (
                        <a key={prov.id} className="hm-v3-staff-item" href="/providers">
                          <span className={`hm-v3-staff-ring is-${statusKey}`}>
                            <Avatar name={prov.displayName} id={prov.id} size={36} photoUrl={prov.photoUrl} />
                          </span>
                          <strong className="hm-v3-staff-name">{prov.displayName.split(' ')[0]}</strong>
                          <span className="hm-v3-staff-role">{t.providerRoleWord}</span>
                          <span className={`hm-v3-staff-pill is-${statusKey}`}>
                            <i />
                            {statusLabel}
                          </span>
                          <span className={`hm-v3-staff-in ${inTimeLabel ? 'is-in' : ''}`}>
                            {inTimeLabel ? t.staffInTime(inTimeLabel) : t.staffNotInYet}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* ROW 3 — Revenue Trend + Top Services + Recent Activity */}
          <div className="hm-v3-bot">
            {/* 1. Revenue trend */}
            <section className="hm-v3-card hm-v3-trend-card">
              <div className="hm-v3-card-head">
                <h2>{t.revenueTrendTitle}</h2>
                <button
                  type="button"
                  className="hm-v3-period-pill"
                  onClick={() => {
                    const next = period === 'week' ? 'month' : 'week';
                    setPeriod(next);
                    load(next, branch);
                  }}
                >
                  {data?.week.span === 'month' ? t.thisMonth : t.thisWeek} ▾
                </button>
              </div>
              <div className="hm-v3-trend-summary">
                <strong className="hm-v3-trend-total">{rupees(data?.week.revenueMinor ?? 0)}</strong>
                <div className="hm-v3-trend-delta">
                  <span className="hm-v3-badge-green">
                    {data?.money.deltaPct !== null && data?.money.deltaPct !== undefined
                      ? `${data.money.deltaPct >= 0 ? '↑' : '↓'} ${Math.abs(data.money.deltaPct)}%`
                      : '↑ 18%'}
                  </span>
                  <span className="hm-v3-trend-vs">{t.vsLastWeek}</span>
                </div>
              </div>
              <div className="hm-v3-chart-box">
                <div className="hm-v3-yaxis" aria-hidden>
                  <span>12K</span>
                  <span>9K</span>
                  <span>6K</span>
                  <span>3K</span>
                  <span>0</span>
                </div>
                <div className="hm-v3-bars">
                  {(weekDays.length > 0
                    ? weekDays
                    : [
                        { date: 'mon', weekday: 'Mon', revenueMinor: 320000, future: false },
                        { date: 'tue', weekday: 'Tue', revenueMinor: 410000, future: false },
                        { date: 'wed', weekday: 'Wed', revenueMinor: 580000, future: false },
                        { date: 'thu', weekday: 'Thu', revenueMinor: 542000, future: false },
                        { date: 'fri', weekday: 'Fri', revenueMinor: 480000, future: false },
                        { date: 'sat', weekday: 'Sat', revenueMinor: 640000, future: false },
                        { date: 'sun', weekday: 'Sun', revenueMinor: 780000, future: false },
                      ]
                  ).map((d, idx) => {
                    const pct = d.revenueMinor > 0 ? Math.max(16, Math.round((d.revenueMinor / maxWeekDayRev) * 76)) : 16 + idx * 8;
                    const isPeak = idx === peakWeekIdx;
                    return (
                      <div key={d.date} className={`hm-v3-bar-col ${isPeak ? 'is-peak' : ''}`}>
                        <div className="hm-v3-bar-track">
                          {isPeak ? (
                            <span className="hm-v3-bar-tip" style={{ bottom: `calc(${pct}% + 6px)` }}>
                              {rupees(d.revenueMinor)}
                            </span>
                          ) : null}
                          <span className="hm-v3-bar-fill" style={{ height: `${pct}%` }} />
                        </div>
                        <span className="hm-v3-bar-day">{d.weekday || d.date.slice(0, 3)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 2. Top services */}
            <section className="hm-v3-card hm-v3-services-card">
              <div className="hm-v3-card-head">
                <h2>
                  {t.topServicesTitle} <span className="hm-v3-count">({t.thisWeek})</span>
                </h2>
                {canSee('/reports', p.role, p.reportTabs) ? (
                  <a className="hm-v3-head-link" href="/reports?tab=services">
                    {t.viewAll} →
                  </a>
                ) : null}
              </div>
              {rankedServices.length === 0 ? (
                <p className="hm-empty">{t.nothingToday}</p>
              ) : (
                <ol className="hm-v3-srv-rows">
                  {rankedServices.map((srv, idx) => {
                    const pct = Math.max(18, Math.round((srv.bookings / maxServiceBookings) * 100));
                    return (
                      <li key={srv.id} className="hm-v3-srv-row">
                        <span className="hm-v3-srv-rank">{idx + 1}</span>
                        <Avatar name={srv.name} id={srv.id} size={32} />
                        <div className="hm-v3-srv-main">
                          <strong className="hm-v3-srv-name">{srv.name}</strong>
                          <div className="hm-v3-srv-bar">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="hm-v3-srv-bk">
                          {srv.bookings} {t.bookingWord(srv.bookings)}
                        </span>
                        <strong className="hm-v3-srv-rev">{rupees(srv.revenueMinor)}</strong>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {/* 3. Recent activity */}
            <section className="hm-v3-card hm-v3-activity-card">
              <div className="hm-v3-card-head">
                <h2>{t.recentActivityTitle}</h2>
                <a className="hm-v3-head-link" href="/appointments">
                  {t.viewAll} →
                </a>
              </div>
              {recentFeed.length === 0 ? (
                <p className="hm-empty">{t.nothingToday}</p>
              ) : (
                <ul className="hm-v3-feed-rows">
                  {recentFeed.map((item) => (
                    <li key={item.id}>
                      <a className="hm-v3-feed-row" href={item.href}>
                        <span className={`hm-v3-feed-icon is-${item.tone}`}>
                          {item.tone === 'blue' ? (
                            <IconReceipt />
                          ) : item.tone === 'amber' ? (
                            <IconProducts />
                          ) : item.tone === 'rose' ? (
                            <IconBan />
                          ) : (
                            <IconCalendar />
                          )}
                        </span>
                        <span className="hm-v3-feed-text">{item.text}</span>
                        <span className="hm-v3-feed-time">{item.time}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <div className={`hm-owner-grid ${hideUntilBranch ? 'is-settling' : ''}`} aria-busy={hideUntilBranch || undefined}>
          {/* The figures are the branch's; while a switch loads, the last ones stay, dimmed. A failed read says so. */}
          {/* On a phone, "All branches" is a carousel with one card per branch (the hero stays for a laptop). */}
          <div className={`hm-area-hero ${showCarousel ? 'has-carousel' : ''}`}>
            {data && (dataIsForBranch || !failed) ? <MoneyHero
                t={t}
                data={data}
                loading={loading || !dataIsForBranch}
                onDaySummary={() => setSummaryOpen(true)}
                branchId={branch}
                onPickBranch={pickBranch}
              /> : <CardError t={t} onRetry={() => load(period, branch)} />}
            {showCarousel && data ? <BranchCarousel t={t} data={data} period={period} refreshKey={serverSig} onPick={pickBranch} /> : null}
          </div>

          {/*
            Quick links, directly under the money card (owner, 2026-10-04).

            GRW-486 had sent these to the bottom, on the argument that a grid of nine links repeats
            the tab bar and should not outrank the day. The owner uses them as the way INTO the app
            — Packages, Offers, Free times and Settings have no tab at all — and wants them where
            the hand lands after reading the takings. So they sit second, and what needs the owner
            follows them.
          */}
          <Card className="hm-area-links hm-mobile" title={t.quickLinks}>
            <QuickTiles items={links} />
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
                <BookingRows
                  t={t}
                  groups={groups.shown}
                  timezone={p.timezone}
                  now={now}
                  empty={listIsTomorrow ? t.nothingTomorrow : t.nothingToday}
                  onOpen={setOpenBooking}
                />
              )}
            </div>
          </Card>

          {/*
            Jira GRW-486 — on every width. Last of the phone's cards but the laptop's (owner, 2026-10-06): the day's
            bookings are read first, and this is what is left to do once they are.

            This card was `hm-desktop` from GRW-222 until now, on the reasoning that "a phone's Home is
            money, shortcuts, clients and the day". But it is the only card on Home that asks the owner
            to DO something — visits not marked done, today's cancellations, staff not marked in — and
            the owner with a phone in their hand is the one who can act on it. What it displaced is a
            grid of nine links to screens the tab bar and the drawer already reach.
          */}
          <Card
            className="hm-area-attention" title={t.needsYourAttention}
            action={
              canSee('/reports', p.role, p.reportTabs) ? (
                <a className="hm-link" href="/reports">
                  {t.whatToDoLink} ›
                </a>
              ) : attentionTotal === 0 && !failed ? (
                <span className="hm-pill hm-pill-green">{t.allClear}</span>
              ) : undefined
            }
          >
            {failed && !dataIsForBranch ? <CardError t={t} /> : <AttentionList items={attention} />}
          </Card>

          {/* Jira GRW-351 — laptop only; row 2 mirrors row 1. Its data is Bookings today's, so the two agree. */}
          <RightNow t={t} today={todayGroups} tomorrow={tomorrowGroups} queue={queue} now={now} afterClose={listIsTomorrow} timezone={p.timezone} />

          {/*
            The client segments are the laptop's (owner, 2026-10-04).

            Four tiles, a two-line explanation above them and about 320px of a phone screen, for
            counts that do not change through the day and that nobody acts on standing at the
            counter. Clients is a tab, and each tile's link is a filter on it, so nothing here
            becomes unreachable — it stops taking the room the day's work wants.
          */}
          <Card className="hm-area-clients hm-desktop" title={t.clientsDoingTitle}>
            <SegmentCards t={t} stats={clientStats} branch={branch} />
          </Card>

        </div>
      </div>

      {openBooking ? <BookingSummary booking={openBooking} timezone={p.timezone} onClose={() => setOpenBooking(null)} /> : null}
      {actionBooking ? (
        <BookingSheet
          appointment={actionBooking.appointments.find((a) => a.status === actionBooking.status) ?? actionBooking.appointments[0]!}
          timezone={p.timezone}
          onClose={() => setActionBooking(null)}
          comboServiceNames={actionBooking.isCombo ? actionBooking.serviceNames : undefined}
          comboTotalMin={actionBooking.totalMin}
          comboLegs={actionBooking.isCombo ? actionBooking.appointments : undefined}
        />
      ) : null}
      {givingEntry ? (
        <GiveToStaffSheet
          t={t}
          entry={givingEntry}
          providers={p.providers}
          busy={busy}
          onClose={() => setGivingEntry(null)}
          onRecordPayment={() => {
            const entry = givingEntry;
            setGivingEntry(null);
            router.push(payTokenHref(entry));
          }}
        />
      ) : null}

      {summaryOpen ? (
        <DaySummarySheet
          t={t}
          locationId={branch}
          subtitle={[p.dateLabel, locationLine, afterClose && closeTime ? t.dayClosed(closeTime) : null].filter(Boolean).join(' · ')}
          dateLabel={p.dateLabel}
          onClose={() => setSummaryOpen(false)}
        />
      ) : null}
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
