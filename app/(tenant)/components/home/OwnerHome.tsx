'use client';

import { DateTime } from 'luxon';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  formatTime,
  type Appointment,
  type AutopayRenewal,
  type CustomerStats,
  type HomeOverview,
  type HomePeriod,
  type Product,
  type Provider,
  type QueueEntry,
  type TokenBoard as TokenBoardData,
} from '../../lib/api';
import { bookingBill, clientNameLabel, groupBookings, summarizeServices, type BookingGroup } from '../../lib/appointment-display';
import { paidCustomers } from '../../lib/paid-customers';
import { countsAsNotMarked, liveState, minutesBetween } from '../../lib/live-state';
import { hasLiveWork, TokenBoard } from './TokenBoard';
import { useTokenWords } from './token-words';
import { atBranch } from '../../lib/right-now';
import { useBranch } from '../BranchProvider';
import { useMayUse, usePendingAttendance, useWritable } from '../SessionProvider';
import { homeCopy } from '../../lib/home-copy';
import { closingTime } from '../../lib/day-summary-view';
import type { Lang } from '../../lib/lang';
import { canSee, type MemberRole } from '../../lib/nav-policy';
import {
  IconBan,
  IconCalendarPlus,
  IconCart,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconDaySummary,
  IconPlus,
  IconPackages,
  IconReceipt,
  IconReports,
  IconServices,
  IconSettings,
  IconStaff,
} from '../icons';
import { AutopayRenewalNotice } from '../AutopayRenewalNotice';
import { BookingSummary } from '../BookingSummary';
import { DaySummarySheet } from './DaySummarySheet';
import { MoneyHero } from './MoneyHero';
import { BranchCarousel } from './BranchCarousel';
import { AttentionList, Avatar, avatarKey, BookingRows, Card, CardError, DarkStatCard, HomeHeader, PageHead, PayGaugeCard, paySlicesOf, QuickTiles, rupees, Segmented, SegmentCards, WeekBarsCard } from './parts';
import { RightNow } from './RightNow';
import { useMinuteClock } from './useMinuteClock';
import { deltaLabel, deltaTone } from './day-delta';

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

/** Where the Command Center replaces the phone's Home (the same width the stylesheet switches at). */
const DESK_QUERY = '(min-width: 1101px)';

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
  /*
   * Jira GRW-74 — through `useMayUse`, not `mayUse` directly: a manager-LIKE role lands on this Home (`homeKind`
   * answers 'owner' for manager), and `mayUse` alone knows only the fixed word their role works like, not the grid
   * the owner actually filled in. Called the same way as every other control in the app (review, 2026-10-22).
   */
  const mayBook = useMayUse('visit.new');
  const mayRecordPayment = useMayUse('visit.recordPayment');

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
  // Jira GRW-679 (UX-04) — a comparison is drawn only when the API has one AND this period has takings.
  const periodDeltaShown = Boolean(data && data.money.deltaPct !== null && data.money.deltaPct !== undefined && data.money.revenueMinor > 0);
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

  const rowState = (g: BookingGroup) => liveState(g, now);

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
  const [shelfProducts, setShelfProducts] = useState<Product[] | null>(null);


  /*
   * Release review, 2026-10-17 — the Command Center is the laptop's Home. Its extra reads are made only where it is
   * drawn: a phone used to make them on every load and every branch switch for a block it never shows. Read in an
   * effect, so the server and the first client render agree.
   */
  const [deskHome, setDeskHome] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESK_QUERY);
    const sync = () => setDeskHome(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!branchContext.ready || !deskHome) return;
    let cancelled = false;
    api
      .products(branch)
      .then((res) => !cancelled && setShelfProducts(res))
      .catch(() => !cancelled && setShelfProducts(null));
    return () => {
      cancelled = true;
    };
  }, [branchContext.ready, deskHome, branch, serverSig]);

  /*
   * Today's visits by live state, once — the bookings card's pill and the schedule list both read these.
   * Always today, even after close: the desk's schedule is the day that is ending, not tomorrow's list.
   */
  const todayByState = useMemo(() => {
    const active: BookingGroup[] = [];
    const later: BookingGroup[] = [];
    const done: BookingGroup[] = [];
    for (const g of todayGroups ?? []) {
      const s = rowState(g);
      if (s === 'in_service' || s === 'needs_answer') active.push(g);
      else if (s === 'later') later.push(g);
      else if (s === 'done') done.push(g);
    }
    return { active, later, done, total: (todayGroups ?? []).length };
    // `rowState` reads `now`, which is listed.
  }, [todayGroups, now]);

  /* Emerald v3 — the week chart's columns from the overview's own days; a day still to come is an empty track. */
  const weekBars = useMemo(() => {
    const days = data?.week.days ?? [];
    const max = Math.max(...days.map((d) => d.revenueMinor), 0);
    if (max <= 0) return [];
    const peak = days.reduce((best, d, i) => (d.revenueMinor > (days[best]?.revenueMinor ?? 0) ? i : best), 0);
    return days.map((d, i) => ({
      key: d.date,
      label: d.weekday,
      pct: d.future || d.revenueMinor <= 0 ? 0 : Math.max(8, Math.round((d.revenueMinor / max) * 100)),
      amount: !d.future && d.revenueMinor > 0 ? rupees(d.revenueMinor) : null,
      peak: i === peak,
      srText: `${d.weekday} ${rupees(d.revenueMinor)}`,
    }));
  }, [data]);
  // Owner, 9 Nov 2026 — only clients who have paid: see `paidCustomers`.
  const totalClientsCount = paidCustomers(clientStats) ?? 0;

  const deskAttention = useMemo(() => {
    const overdueGroups = (todayGroups ?? []).filter((g) => countsAsNotMarked(g, now));
    const waitingTokens = boardTokens.filter((tk) => tk.state === 'waiting');
    const branchAtt = dataIsForBranch ? data?.attention : null;
    const unmarkedCount = Math.max(branchAtt?.notMarkedDone ?? 0, overdueGroups.length);
    const bookingCount = unmarkedCount + waitingTokens.length;

    // Owner, 2026-10-19 — who has not marked in is the Staff status card's job, one card to the right; only what has
    // to be decided (attendance to approve) stays here.
    const totalCount = bookingCount + pendingAttendance;

    const rows: Array<{
      id: string;
      name: string;
      avatarId: string;
      photoUrl?: string | null;
      sub: string;
      pill: string;
      tone: 'amber' | 'blue' | 'rose';
      href: string;
    }> = [];

    for (const g of overdueGroups) {
      const who = clientNameLabel(g) ?? t.walkInAction;
      rows.push({
        id: `overdue-${g.key}`,
        name: who,
        avatarId: avatarKey(g),
        sub: `${summarizeServices(g.serviceNames, t.lang)} · ${formatTime(g.startAt, p.timezone)}`,
        pill: t.settlePill,
        tone: 'amber',
        href: unmarkedHref,
      });
    }
    if (unmarkedCount > overdueGroups.length) {
      const extra = unmarkedCount - overdueGroups.length;
      rows.push({
        id: 'overdue-summary',
        name: `${extra} ${t.notMarkedDone}`,
        avatarId: 'overdue-summary',
        sub: t.fromToday,
        pill: t.settlePill,
        tone: 'amber',
        href: unmarkedHref,
      });
    }
    for (const tk of waitingTokens) {
      const who = tk.customerName || t.walkInAction;
      const svc = tk.serviceNames.length > 0 ? summarizeServices(tk.serviceNames, t.lang) : w.servicesAtPayment;
      rows.push({
        id: `wait-${tk.id}`,
        name: who,
        avatarId: tk.customerId ?? tk.id,
        sub: `#${tk.tokenNo} · ${svc}`,
        pill: t.waitingPill,
        tone: 'amber',
        href: `/appointments${branch ? `?location=${encodeURIComponent(branch)}` : ''}`,
      });
    }
    if (pendingAttendance > 0) {
      rows.push({
        id: 'att-approve',
        name: `${pendingAttendance} ${t.attendanceToApprove}`,
        avatarId: 'att-approve',
        sub: t.attendanceWord,
        pill: t.approvePill,
        tone: 'amber',
        href: '/attendance',
      });
    }
    return {
      bookingCount,
      totalCount,
      rows: rows.slice(0, 5),
    };
  }, [todayGroups, now, boardTokens, dataIsForBranch, data, branch, pendingAttendance, t, w, p.timezone, unmarkedHref]);

  const productAttention = useMemo(() => {
    const list = (shelfProducts ?? []).filter((pr) => pr.active);
    const out = list.filter((pr) => pr.stock <= 0);
    const low = list.filter((pr) => pr.stock > 0 && pr.lowStockAt > 0 && pr.stock <= pr.lowStockAt);
    const flagged = [...out, ...low].sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
    return {
      outCount: out.length,
      lowCount: low.length,
      totalCount: out.length + low.length,
      items: flagged.slice(0, 5),
    };
  }, [shelfProducts]);

  const branchProviders = useMemo(
    () => p.providers.filter((prov) => !branch || !prov.locationId || prov.locationId === branch),
    [p.providers, branch],
  );
  const absentSet = useMemo(() => new Set(p.staffAbsentIds ?? []), [p.staffAbsentIds]);

  const links = [
    // Owner, 10 Nov 2026 — Record payment leads the phone's quick links, where Staff was; Staff takes Products' place, and
    // Products is reached from the menu's Catalogue. Only for a role that may record a payment (the desktop button's gate).
    ...(mayRecordPayment ? [{ href: '/appointments/new?purpose=payment', label: t.recordPayment, icon: <IconReceipt />, tone: 'green' }] : []),
    { href: '/services', label: t.nav.services, icon: <IconServices />, tone: 'green' },
    // Jira GRW-438 — a quick link of its own, asked for alongside the screen.
    { href: '/packages', label: t.nav.packages, icon: <IconPackages />, tone: 'green' },
    { href: '/providers', label: t.nav.staff, icon: <IconStaff />, tone: 'rose' },
    // Owner, 2026-10-19 — Sell product takes Offers' place in the phone quick links; Offers is one tap away in the menu.
    { href: '/products/sell', label: t.sellProductAction, icon: <IconCart />, tone: 'blue' },
    { href: '/attendance', label: t.nav.attendance, icon: <IconClipboardCheck />, tone: 'violet' },
    { href: '/reports', label: t.nav.reports, icon: <IconReports />, tone: 'amber' },
    { href: '/settings', label: t.nav.settings, icon: <IconSettings />, tone: 'slate' },
  ].filter((l) => canSee(l.href, p.role, p.reportTabs));

  /** A link only where this role may open the page; otherwise the card is plain (an `<a>` without `href`). */
  const mayOpen = (href: string) => canSee(href, p.role, p.reportTabs);

  return (
    <>
      <HomeHeader
        t={t}
        // Hindi's greeting already ends in "!"; strip it so the wave never reads "नमस्ते!! 👋".
        title={`${t.greeting(p.greetingPart).replace(/!$/, '')}! 👋`}
        sub={t.ownerSub(p.businessName, afterClose)}
        businessName={p.businessName}
        locationName={multiBranch ? null : locationLine}
        dateLabel={p.dateLabel}
        simpleDesktop
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
                  <a href="/appointments/new?mode=later" className="hm-action hm-action-dark">
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

        {/* Simple, clean desktop Home — Option 1: Warm Salon Reception */}
        <div className={`rst-desk hm-desktop sln-desk ${hideUntilBranch ? 'is-settling' : ''}`}>
          {/* Emerald v3 (owner, 2026-11-14, "apply the same layout to all verticals") — the page head, as the shop's. */}
          <PageHead title={t.greeting(p.greetingPart)} sub={`${p.dateLabel} · ${t.ownerSub(p.businessName, afterClose)}`}>
            <button type="button" className="rst-pill" onClick={() => setSummaryOpen(true)}>
              <IconDaySummary />
              <span>{t.daySummary}</span>
            </button>
            {mayBook ? (
              <a className="rst-pill is-primary" href="/appointments/new?mode=now">
                <IconPlus />
                <span>{t.nav.newBooking}</span>
              </a>
            ) : null}
          </PageHead>

          {/* ROW 1 — 3 Soft Pastel KPI Cards */}
          <div className="rst-kpis">
            {/* 1. Today's sales */}
            <div className="rst-kpi rst-kpi-sales">
              {mayOpen('/reports') ? (
                <a className="rst-kpi-go" href="/reports" aria-label={t.nav.reports}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg></a>
              ) : null}
              <svg className="rst-kpi-wave" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden>
                <path d="M0 45 C120 70 260 15 400 38 L400 70 L0 70 Z" fill="currentColor" />
              </svg>
              <div className="rst-kpi-top">
                <span className="rst-kpi-icon is-sales" aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="6" rx="7" ry="3" />
                    <path d="M5 6v4c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
                    <path d="M5 10v4c0 1.66 3.13 3 7 3s7-1.34 7-3v-4" />
                    <path d="M5 14v4c0 1.66 3.13 3 7 3s7-1.34 7-3v-4" />
                  </svg>
                </span>
                <div className="rst-kpi-main">
                  <span className="rst-kpi-label">{t.shop.todaysTakings}</span>
                  <strong className="rst-kpi-value">{rupees(data?.money.revenueMinor ?? 0)}</strong>
                </div>
                {periodDeltaShown && data ? (
                  <div className="rst-kpi-side">
                    <span className={`rst-delta-pill ${deltaTone(data.money.deltaPct ?? 0)}`}>{deltaLabel(data.money.deltaPct ?? 0)}</span>
                    <span className="rst-delta-sub">{t.vsYesterday}</span>
                  </div>
                ) : null}
              </div>
              {data?.money.byPaymentMode && data.money.byPaymentMode.length > 0 && (data.money.revenueMinor ?? 0) > 0 ? (
                <div className="rst-kpi-modes" role="group" aria-label={t.howPaid}>
                  {[...data.money.byPaymentMode]
                    .sort((a, b) => b.revenueMinor - a.revenueMinor)
                    .map((m) => (
                      <span key={m.mode} className="rst-kpi-mode">
                        <i className={`rst-mode-dot is-${m.mode}`} aria-hidden />
                        <span>{t.payment[m.mode]}</span>
                        <b>{rupees(m.revenueMinor)}</b>
                      </span>
                    ))}
                </div>
              ) : null}
            </div>

            {/* 2. Bookings today */}
            <a className="rst-kpi rst-kpi-orders" href={mayOpen('/appointments') ? '/appointments' : undefined}>
              <span className="rst-kpi-go" aria-hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg></span>
              <svg className="rst-kpi-wave" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden>
                <path d="M0 48 C140 20 270 65 400 35 L400 70 L0 70 Z" fill="currentColor" />
              </svg>
              <span className="rst-kpi-icon is-orders" aria-hidden>
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2.5" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <div className="rst-kpi-main">
                <span className="rst-kpi-label">{t.bookingsToday}</span>
                <strong className="rst-kpi-value">{todayByState.total}</strong>
                {todayByState.active.length > 0 || todayByState.later.length > 0 ? (
                  <span className="sln-kpi-pill is-blue">{t.nowLaterPill(todayByState.active.length, todayByState.later.length)}</span>
                ) : null}
              </div>
            </a>

            {/* 3. Clients */}
            <a className="rst-kpi rst-kpi-customers" href={mayOpen('/customers') ? '/customers' : undefined}>
              <span className="rst-kpi-go" aria-hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg></span>
              <svg className="rst-kpi-wave" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden>
                <path d="M0 42 C130 65 260 22 400 44 L400 70 L0 70 Z" fill="currentColor" />
              </svg>
              <span className="rst-kpi-icon is-customers" aria-hidden>
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <div className="rst-kpi-main">
                <span className="rst-kpi-label">{t.nav.clients}</span>
                <strong className="rst-kpi-value">{totalClientsCount}</strong>
                {(data?.money.newCustomers ?? 0) > 0 ? (
                  <span className="sln-kpi-pill is-amber">{t.newTodayPill(data?.money.newCustomers ?? 0)}</span>
                ) : null}
              </div>
            </a>
          </div>

          {/*
            ROW 2 — Emerald v3: the week in pictures instead of four shortcut tiles (the page head and the sidebar keep
            those doors). The week's takings by day, today's takings by how they were paid, and who is being served now.
          */}
          <div className="rst-charts">
            {weekBars.length > 0 ? (
              <WeekBarsCard
                title={data?.week.span === 'month' ? t.shop.salesThisMonth : t.shop.salesThisWeek}
                total={rupees(data?.week.revenueMinor ?? 0)}
                bars={weekBars}
              />
            ) : null}
            <PayGaugeCard title={t.shop.paidToday} slices={paySlicesOf(data?.money.byPaymentMode)} nameOf={(m) => t.payment[m] ?? m} money={rupees} />
            <DarkStatCard
              title={t.rightNow}
              value={todayByState.active.length}
              valueLabel={t.inTheChair}
              foot={
                <>
                  {t.laterToday}: <b>{todayByState.later.length}</b>
                </>
              }
              action={mayOpen('/appointments') ? { href: '/appointments', label: t.todaysDiary } : null}
            />
          </div>

          {/* ROW 3 — Two-Column Bottom Grid: Today's schedule (left) + Team on the floor (right) */}
          <div className="rst-bottom-grid">
            {/* Left: Today's schedule */}
            <section className="rst-panel rst-recent-panel">
              <div className="rst-panel-head">
                <h3>{t.todaysScheduleTitle}</h3>
                {mayOpen('/appointments') ? (
                  <a className="rst-view-all" href="/appointments">
                    {t.openDiaryLink} →
                  </a>
                ) : null}
              </div>
              {(() => {
                const slnScheduleRows = [...todayByState.active, ...todayByState.later, ...[...todayByState.done].reverse()].slice(0, 4);
                if (slnScheduleRows.length === 0) {
                  return <p className="hm-empty">{t.nothingToday}</p>;
                }
                return (
                  <ul className="rst-order-list">
                    {slnScheduleRows.map((b) => {
                      const timeStr = formatTime(b.startAt, p.timezone);
                      const cName = clientNameLabel(b) ?? b.customerName ?? '—';
                      const svcLabel = summarizeServices(b.serviceNames, p.lang);
                      const staffName = b.providerNames.length > 0 ? b.providerNames.join(', ') : null;
                      const { totalMinor: servicesBillMinor } = bookingBill(b.appointments);
                      const productsBillMinor = (b.products ?? []).reduce((s, pr) => s + Number(pr.paidMinor || 0), 0);
                      const billMinor = servicesBillMinor + productsBillMinor;
                      const st = rowState(b);
                      const isActive = st === 'in_service' || st === 'needs_answer';
                      const statusClass =
                        isActive
                          ? 'is-served'
                          : st === 'later'
                            ? 'is-preparing'
                            : st === 'done'
                              ? 'is-done-neutral'
                              : 'is-problem';
                      const statusLabel = isActive
                        ? t.inProgressLabel
                        : st === 'later'
                          ? t.upcomingLabel
                          : st === 'done'
                            ? t.status.completed
                            : st === 'cancelled'
                              ? t.cancelledLabel
                              : t.noShowLabel;
                      return (
                        <li key={b.key}>
                          <button type="button" className="rst-order-row" onClick={() => setOpenBooking(b)}>
                            <Avatar name={cName} id={avatarKey(b)} size={40} />
                            <div className="rst-order-main">
                              <strong className="rst-order-num">{cName}</strong>
                              <span className="rst-order-sub">
                                {svcLabel} · {timeStr}
                                {staffName ? ` · ${staffName}` : ''}
                              </span>
                            </div>
                            <span className={`rst-status-pill ${statusClass}`}>{statusLabel}</span>
                            <div className="rst-order-right">
                              <strong className="rst-order-amt">{rupees(billMinor)}</strong>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </section>

            {/* Right: Team on the floor */}
            <section className="rst-panel rst-attention-panel sln-team-panel">
              <div className="rst-panel-head">
                <h3>
                  {t.teamOnFloorTitle} ({branchProviders.length})
                </h3>
                {mayOpen('/providers') ? (
                  <a className="rst-view-all" href="/providers">
                    {t.manageLink} →
                  </a>
                ) : null}
              </div>
              {branchProviders.length === 0 ? (
                <p className="hm-empty">{t.teamEmpty}</p>
              ) : (
                <ul className="sln-team-list">
                  {branchProviders.map((prov) => {
                    const inChair = busy.get(prov.id);
                    const isAbsent = absentSet.has(prov.id);
                    const statusKey = inChair ? 'busy' : isAbsent ? 'absent' : 'available';
                    const statusLabel = inChair ? `● ${t.busyLabel}` : isAbsent ? `● ${t.absentLabel}` : `● ${t.availableNow}`;
                    const subText = inChair ? t.withClient(inChair.client) : isAbsent ? t.notInToday : t.freeNow;
                    return (
                      <li key={prov.id}>
                        <a className="sln-team-row" href={mayOpen('/providers') ? '/providers' : undefined}>
                          <Avatar name={prov.displayName} id={prov.id} size={40} photoUrl={prov.photoUrl} />
                          <div className="sln-team-main">
                            <strong className="sln-team-name">{prov.displayName}</strong>
                            <span className="sln-team-sub">{subText}</span>
                          </div>
                          <span className={`sln-team-pill is-${statusKey}`}>{statusLabel}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
              {(() => {
                const attItems: Array<{ key: string; title: string; sub: string; href: string; tone: 'amber' | 'rose' }> = [
                  ...deskAttention.rows.map((r) => ({
                    key: r.id,
                    title: r.name,
                    sub: r.sub,
                    href: r.href,
                    tone: (r.tone === 'rose' ? 'rose' : 'amber') as 'amber' | 'rose',
                  })),
                  ...(productAttention.totalCount > 0
                    ? [
                        {
                          key: 'stock',
                          title: t.productsAttentionTitle,
                          sub:
                            productAttention.outCount > 0
                              ? `${productAttention.outCount} ${t.outOfStockLabel.toLowerCase()}`
                              : `${productAttention.lowCount} ${t.lowStockLabel.toLowerCase()}`,
                          href: `/products?filter=${productAttention.outCount > 0 ? 'out' : 'low'}${branch ? `&branch=${encodeURIComponent(branch)}` : ''}`,
                          tone: (productAttention.outCount > 0 ? 'rose' : 'amber') as 'amber' | 'rose',
                        },
                      ]
                    : []),
                ];
                if (attItems.length === 0) return null;
                return (
                  <div className="rst-att-stack sln-att-stack">
                    {attItems.slice(0, 2).map((item) => (
                      <a key={item.key} className={`rst-att-card ${item.tone === 'amber' ? 'is-amber' : 'is-rose'}`} href={item.href}>
                        <span className={`rst-att-icon ${item.tone === 'amber' ? 'is-amber' : 'is-rose'}`} aria-hidden>
                          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </span>
                        <div className="rst-att-body">
                          <strong>{item.title}</strong>
                          <span>{item.sub}</span>
                        </div>
                        <svg className="rst-att-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </a>
                    ))}
                  </div>
                );
              })()}
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
