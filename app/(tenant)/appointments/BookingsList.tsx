'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatMoney, formatTime, type Appointment, type MyEarnings, type Provider, type QueueEntry } from '../lib/api';
import { useTranslations, useLocale } from 'next-intl';
import { countsAsNotMarked, liveState, minutesBetween } from '../lib/live-state';
import { bookingBill, clientNameLabel, formatDuration, groupBookings, statusChip, summarizeServices, type BookingGroup } from '../lib/appointment-display';
import { formatDateWithWeekday } from '../lib/format';
import { BookingSheet, bookingRef, dialable } from '../components/BookingSheet';
import { BookingSummary } from '../components/BookingSummary';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { useBranch } from '../components/BranchProvider';
import { useLabels } from '../components/LabelsProvider';
import { useMayUse } from '../components/SessionProvider';
import { GiveToStaffSheet } from '../components/home/GiveToStaffSheet';
import { SHOW_STEP } from '../components/home/use-visible-rows';
import { usePhoneLayout } from '../components/home/use-phone-layout';
import { NewVisitSheet } from '../components/NewVisitSheet';
import { homeCopy } from '../lib/home-copy';
import { atBranch, wholeMinutes } from '../lib/right-now';
import {
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconFilter,
  IconMenu,
  IconPackages,
  IconPhone,
  IconSearch,
  IconSort,
  IconStaff,
  IconUserPlus,
} from '../components/icons';

/**
 * A staff member's rail/avatar colour, mobile only (GRW-46). Hashed from
 * their name rather than a per-name lookup table — the mock this mirrors
 * hardcoded four fake names, but a real tenant's roster is arbitrary, so the
 * colour has to come from the data, not a map that would miss every fifth
 * hire.
 */
function staffHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
const railColorFor = (name: string) => `oklch(0.56 0.13 ${staffHue(name)})`;
const staffBgFor = (name: string) => `oklch(0.95 0.045 ${staffHue(name)})`;
/*
 * The initial in the avatar is text, and the rail's colour is not dark enough to be it: measured
 * on a booking card, oklch(0.56 0.13 H) on oklch(0.95 0.045 H) is 3.69-3.73:1, under the 4.5:1
 * that 12px type needs. The 4px rail down the card's edge is decoration and keeps its lightness;
 * the letter gets its own ink, at the same lightness Attendance's avatars already use (8.5:1).
 */
const staffInkFor = (name: string) => `oklch(0.4 0.1 ${staffHue(name)})`;

/**
 * The three lists the day can be read as.
 *
 * Waiting and Booked were separate until the owner pointed out that they are the same answer to
 * the question a receptionist actually asks — what is left to do. They share a state: nobody has
 * been served yet. They differ in where the person is, and that difference is kept inside `To do`,
 * where the waiting block sits at the top with its tokens, rather than as a tab of its own.
 *
 * `To do` and `Completed` partition the day; `All` is the day in time order.
 */
const TABS = ['all', 'todo', 'completed'] as const;

/** What the salon actually took for a booking (see `bookingBill`). */
function bookingTotalMinor(b: BookingGroup): number {
  return bookingBill(b.appointments).totalMinor;
}

/** Jira GRW-480 — the API sends no prices to a stylist the owner keeps off the money. */
function pricesShown(b: BookingGroup): boolean {
  return b.appointments.some((a) => a.priceMinor != null || a.paidAmountMinor != null);
}


/**
 * The bookings page: a "today" dashboard — headline counts, then the day's
 * schedule as a timeline (or a compact list), then a revenue summary. A combo /
 * multi-service booking is ONE row showing every service and the total time.
 */
export function BookingsList({
  appointments,
  providers,
  timezone,
  noun,
  nowISO,
  queue,
  isToday,
  dayLabel,
  date,
  toDate,
  customerId,
  dayHint,
  emptyMessage,
  initialStatus,
  initialQuery,
  initialStaff,
  initialSort,
  initialUnmarked,
  initialBranch,
  branches = [],
  openAppointmentId,
  viewerIsStaff,
  earnings,
  canReschedule = true,
  loadFailed = false,
}: {
  appointments: Appointment[];
  /** The full roster, for the mobile staff-filter chips (GRW-46) and the desktop staff select (GRW-47) — not just staff with a booking today, so picking one can honestly show "0 bookings" for someone rather than making them disappear. */
  providers: Provider[];
  timezone: string;
  noun: string;
  /** Server clock, so the first client render matches SSR before the tick starts. */
  nowISO: string;
  /**
   * Jira GRW-487 — today's walk-in queue, the whole business's (narrowed to the branch here, as the
   * visits are). `[]` on any day but today; `null` when the read failed, which the section says
   * rather than drawing itself empty.
   */
  queue: QueueEntry[] | null;
  /** Whether the selected day (the filter's date field) is today. */
  isToday: boolean;
  /** Short label for the selected day, e.g. "21 Aug" — used everywhere the page said "Today" when it's actually showing a different day. */
  dayLabel: string;
  /** GRW-47: the day field renders inside this component's own filter card now (alongside search/staff, matching the desktop mock), so this component always renders — even on a day with zero bookings — instead of page.tsx swapping it for a bare empty card. */
  date: string;
  /** The From/To range's end (equal to `date` for a single day). */
  toDate: string;
  /** Set when the page is showing one client's bookings, so the date form's GET submit keeps them rather than dropping back to everyone. */
  customerId?: string;
  dayHint: string;
  /** Shown in place of the schedule when the day itself has zero bookings, before any client-side search/staff filtering. */
  emptyMessage: string;
  /** From ?status= — seeds the Status filter so Home's deep links land pre-filtered. '' = every status. */
  initialStatus: string;
  /** The remaining client-side filters, round-tripped through the URL so the date form's GET submit doesn't reset them. */
  initialQuery: string;
  initialStaff: string;
  initialSort: 'asc' | 'desc';
  /**
   * Jira GRW-63 · GRW-190 — a stylist is looking at their own day, not the
   * salon's. `providers` is already just them (the API scopes the roster), so
   * this only decides WORDING and which controls are worth showing: a staff
   * filter with one name in it, and a "Busiest staff" that can only ever name
   * the reader, are noise that reads as a team view.
   */
  viewerIsStaff: boolean;
  /** Jira GRW-219 — `me.capabilities.reschedule`. Combined with the role below, never instead of it. */
  canReschedule?: boolean;
  /**
   * Jira GRW-220 — the list could not be FETCHED, which is not the same as a
   * day with nothing on it.
   *
   * Kept as its own flag rather than folded into `emptyMessage`, because the
   * two states differ in more than their words: an empty day is a fact the
   * owner can act on, and a failed fetch is a thing to retry. Defaults to
   * false, so a caller that does not know stays on the old behaviour.
   */
  loadFailed?: boolean;
  /**
   * Jira GRW-307 — Search sends you here for one booking. The sheet opens on it
   * the moment the page lands, so a tap on a search result is one tap to the
   * booking, with every action the sheet already has (mark done, didn't come,
   * cancel, move) and combo legs grouped as they are everywhere else.
   */
  openAppointmentId?: string;
  /**
   * Jira GRW-310 — arriving from Home's "Not marked done" card, which counts bookings
   * that ended more than 30 minutes ago and were never marked. The Confirmed tile counts
   * every confirmed booking, including ones still to come, so the card's link narrows to
   * exactly the set it counted (`countsAsNotMarked`, the same rule) instead of promising 3
   * and opening 9. Cleared with the chip above the tiles.
   */
  initialUnmarked: boolean;
  /** Jira GRW-312 — the branch Home was showing when it sent the owner here; null is every branch. */
  initialBranch: { id: string; name: string } | null;
  /** Jira GRW-340 — an owner's open branches when there are two or more; empty draws no tabs. */
  branches?: Array<{ id: string; name: string }>;
  /** Jira GRW-216 — null when the owner has not shown this stylist their takings, or the viewer is not one. */
  earnings?: MyEarnings | null;
}) {
  const locale = useLocale();
  // The server's clock at render. Every redraw (LiveRefresh forces one a minute) brings a fresh
  // `nowISO`, so nothing here needs a timer of its own.
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const t = useTranslations('bookings');
  const ts = useTranslations('status');
  const te = useTranslations('errors');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'timeline' | 'list'>('timeline');
  // Jira-free, owner's call (2026-10-04): on a phone the filter card folds away behind a button.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [open, setOpen] = useState<BookingGroup | null>(null);
  /*
   * Jira GRW-489 — the token the desk has opened, and the one it is taking money for.
   *
   * Two states rather than one with a mode: the give sheet hands the token OVER to the till, so for
   * one render both are set and the overlay never blinks out between them.
   */
  const [giving, setGiving] = useState<QueueEntry | null>(null);
  // On a phone the waiting list draws ten rows and "Show more" adds ten at a time; a laptop draws them all.
  const phone = usePhoneLayout();
  const [waitingShown, setWaitingShown] = useState(SHOW_STEP);
  const [payingToken, setPayingToken] = useState<QueueEntry | null>(null);
  // Mobile-only (GRW-46): both filter the day's already-loaded bookings
  // client-side, independent of the date form's own GET navigation — see
  // GRW-10's BR-01 on why that form stays a full-page submit.
  const [query, setQuery] = useState(initialQuery);
  const [staffFilter, setStaffFilter] = useState(initialStaff);
  // Seeded from ?status= so Home's "Cancellation today" card still deep-links
  // straight to that slice — but it's client-side state from then on, not a
  // second server-side filter racing this one (the contradiction GRW-47 had
  // to untangle for the staff filter).
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [unmarkedOnly, setUnmarkedOnly] = useState(initialUnmarked);
  const [branch, setBranch] = useState(initialBranch);
  const branchContext = useBranch();

  /*
   * Jira GRW-395 — the list shows the header's branch, and follows it when it changes. The day is already loaded
   * for every branch and narrowed here, so nothing is fetched; the address keeps it (`?location=`) so a reload
   * does too. An address that names a branch wins on arrival (Home's links do), through the shared context
   * (Jira GRW-377), once the browser's memory can be read (`ready`).
   */
  const arrived = useRef(false);
  useEffect(() => {
    if (!branchContext.ready) return;
    if (!arrived.current) {
      arrived.current = true;
      if (initialBranch && initialBranch.id !== branchContext.choice) {
        branchContext.setBranch(initialBranch.id);
        return;
      }
    }
    const next = branches.find((b) => b.id === branchContext.choice) ?? null;
    if ((next?.id ?? null) === (branch?.id ?? null)) return;
    setBranch(next);
    setPage(1);
    // A stylist picked at the last branch is not one of this branch's.
    if (next && staffFilter !== 'Everyone' && !providers.some((p) => p.displayName === staffFilter && (!p.locationId || p.locationId === next.id))) {
      setStaffFilter('Everyone');
    }
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('location', next.id);
    else url.searchParams.delete('location');
    window.history.replaceState(null, '', url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchContext.ready, branchContext.choice]);
  // Earliest-first by default: on today's schedule that's the running order of
  // the day, which is what the page is for. Latest-first earns its keep on a
  // From/To range, where the most recent day is usually the interesting end.
  const [sort, setSort] = useState<'asc' | 'desc'>(initialSort);
  /*
   * How many filters are actually narrowing the list — the number on the funnel, so a filter can
   * never be on with the panel shut and nothing to say so.
   *
   * Not the search and not the dates: all three have their own control in view, and counting what
   * is already on screen reports it twice. The funnel counts only what the funnel hides.
   */
  /*
   * The status is the tab's now, so the funnel stops counting it: on Completed the tab already says
   * so, and a badge reading 1 for the same fact is the screen telling you twice.
   */
  const filterCount =
    (staffFilter !== 'Everyone' ? 1 : 0) +
    (unmarkedOnly ? 1 : 0) +
    (sort !== 'asc' ? 1 : 0) +
    // An exception status has no segment to show it, so this count is the only thing that can.
    (statusFilter !== '' && statusFilter !== 'confirmed' && statusFilter !== 'completed' ? 1 : 0);
  // Jira GRW-312 — a branch narrows the day itself, before the tiles are counted, so what Home
  // counted for that branch is what these tiles and this list show.
  const bookings = groupBookings(branch ? appointments.filter((a) => a.locationId === branch.id) : appointments);

  const openedFromSearch = useRef(false);
  useEffect(() => {
    if (!openAppointmentId || openedFromSearch.current) return;
    const group = bookings.find((g) => g.appointments.some((a) => a.id === openAppointmentId));
    // Latched only once it is FOUND: the list can be empty on the first render (a failed
    // fetch) and fill in on the next redraw, and a flag set before the look would have
    // shut the sheet out for good.
    if (!group) return;
    openedFromSearch.current = true;
    setOpen(group);
    // The link has done its job; leaving `?open=` in the address would reopen the sheet on reload.
    const url = new URL(window.location.href);
    if (url.searchParams.has('open')) {
      url.searchParams.delete('open');
      window.history.replaceState(null, '', url);
    }
  }, [openAppointmentId, bookings]);

  // Mobile-only (GRW-46): search + staff chips narrow the SCHEDULE only — the
  // KPI row above stays computed from the full day, matching how a real
  // dashboard's headline counts shouldn't reshuffle just because the owner
  // typed into a search box.
  const q = query.trim().toLowerCase();
  const matchesQuery = (b: BookingGroup) =>
    !q ||
    [bookingRef(b.appointments[0]!.id), b.customerName ?? '', ...b.providerNames, b.customerPhone ?? ''].some((f) =>
      f.toLowerCase().includes(q),
    );
  const matchesStaff = (b: BookingGroup) => staffFilter === 'Everyone' || b.providerNames.includes(staffFilter);
  const matchesStatus = (b: BookingGroup) => !statusFilter || b.status === statusFilter;
  // What the tiles count: everything that matches the search and the staff chips, before the
  // status is applied (the status is what the segmented control chooses between).
  const inView = bookings.filter((b) => matchesStaff(b) && matchesQuery(b));
  const matching = inView.filter(matchesStatus).filter((b) => !unmarkedOnly || countsAsNotMarked(b, now));
  // groupBookings already returns ascending by start time, so descending is a
  // reverse rather than a second sort — and reversing keeps bookings that
  // share a start instant adjacent, which the slot grouping below depends on.
  const filtered = sort === 'desc' ? [...matching].reverse() : matching;
  const filtering = q !== '' || staffFilter !== 'Everyone' || statusFilter !== '' || unmarkedOnly || branch !== null;
  const noMatches = filtering && filtered.length === 0;

  // The desktop Staff dropdown's options.
  // Jira GRW-395 — the header's branch narrows the stylists too: its own chips, its own per-stylist table.
  const branchProviders = useMemo(
    () => (branch ? providers.filter((p) => !p.locationId || p.locationId === branch.id) : providers),
    [providers, branch],
  );
  const staffChipNames = useMemo(() => ['Everyone', ...branchProviders.map((p) => p.displayName)], [branchProviders]);

  // Jira GRW-343 — each person's day for the phone's staff table. Not narrowed by the staff pick itself (it is what picks).


  /*
   * Jira GRW-308 — the tiles are the status filter, so they count what is in view BEFORE it.
   *
   * They used to count `filtered`, exactly what the list showed. That was right for tiles that
   * only reported: picking "Didn't come" and still seeing "27 Completed" above four no-shows
   * contradicted the list. But a tile you can press has to keep its count when another is
   * pressed, or a person who chose "Completed" could never see how many "Confirmed" were left
   * to switch to. The contradiction is gone the other way round: the pressed tile is highlighted
   * and its number is the length of the list under it; the rest are the other answers to
   * "what if I chose that one". Search and staff still narrow all four, so "Priya: 7 bookings,
   * 5 completed" still reads properly.
   *
   * Confirmed is every confirmed booking in view. On today's schedule it used to be only those
   * starting in the next two hours, which a press could not deliver: the tile said 3 and the
   * list showed 7.
   */
  const countIn = (status: string) => inView.filter((b) => b.status === status).length;
  /**
   * A tile's status in the words the owner reads, or null for a status no tile offers (the Status
   * dropdown's own values) — the line below the tiles is about the tiles, so it stays quiet then.
   */
  /*
   * Jira GRW-487 — who is waiting, for the branch in view.
   *
   * Token order IS arrival order, so the server's order is kept rather than re-sorted. They are not
   * folded into the schedule below: that list is ordered by start time and a waiting person has
   * none — nobody has promised them one — so they would have to be given a fake time to sit in it.
   */
  const waiting = useMemo(() => {
    if (!queue) return null;
    /*
     * Sorted by token number (owner, 2026-10-04). The server hands them back in arrival order, which
     * is the same order — until it is not: a token given to a stylist leaves the queue, and one
     * added at another branch can land between two of these. The receptionist calls numbers, so the
     * list is sorted by the thing they call. A token with no number sinks to the bottom rather than
     * sorting as nought.
     */
    return atBranch(queue, branch?.id ?? null)
      .slice()
      .sort((a, b) => (a.tokenNo ?? Number.MAX_SAFE_INTEGER) - (b.tokenNo ?? Number.MAX_SAFE_INTEGER));
  }, [queue, branch]);

  /**
   * One waiting person's row. Lifted out because the row is a button for anyone who can act on a
   * token and a link for anyone who cannot, and the two must not drift into saying different things
   * about the same person.
   */
  const waitingRow = (w: QueueEntry) => (
    <>
      {/* The number is what the client was told at the counter, so it leads the row. */}
      {/* "#2", not "2": a bare number beside a name reads as a count of something. */}
      <span className="bk-waiting-token">{w.tokenNo === null ? '—' : `#${w.tokenNo}`}</span>
      <span className="bk-waiting-who">
        <span className="bk-waiting-name">{w.customerName}</span>
        {w.serviceNames.length > 0 && <span className="bk-waiting-svc">{w.serviceNames.join(' · ')}</span>}
      </span>
      <span className="bk-waiting-min">{t('waitingMin', { count: wholeMinutes(w.addedAt, now) })}</span>
    </>
  );

  /*
   * Jira GRW-489 — what the give sheet needs, built here exactly as both Homes build it.
   *
   * `homeCopy` rather than this screen's `bookings` namespace: the sheet is the desk's, and giving it
   * a second set of words for the same four buttons is how two screens start disagreeing about what
   * "They left" means.
   */
  const labels = useLabels();
  const hc = useMemo(() => homeCopy(locale === 'hi' ? 'hi' : 'en', labels), [locale, labels]);
  const mayGive = useMayUse('queue.give');
  const mayRecordPayment = useMayUse('visit.recordPayment');
  /**
   * providerId → who is in their chair and for how long, for the sheet's free/busy pills.
   *
   * The same derivation Home makes, from the same facts: busy is "has an unpaid visit in the chair"
   * (`in_service`), not "has a booking whose time is now". A group from another day in a range can
   * never be `in_service`, so the range needs no narrowing of its own.
   */
  const busy = useMemo(() => {
    const m = new Map<string, { client: string; min: number }>();
    for (const g of bookings) {
      if (liveState(g, now) !== 'in_service') continue;
      for (const a of g.appointments) {
        if (a.providerId && !m.has(a.providerId)) {
          m.set(a.providerId, { client: clientNameLabel(g) ?? summarizeServices(g.serviceNames, hc.lang), min: minutesBetween(g.startAt, now) });
        }
      }
    }
    return m;
  }, [bookings, now, hc.lang]);

  /** `To do` counts both halves of what is left: the people waiting and the visits not yet done. */
  const tabCount = (seg: (typeof TABS)[number]): number =>
    seg === 'todo'
      ? countIn('confirmed') + (waiting?.length ?? 0)
      : seg === 'completed'
        ? countIn('completed')
        : inView.length + (waiting?.length ?? 0);

  /**
   * Which segment is showing — DERIVED from the status filter, not a second state beside it.
   *
   * The two were separate for an afternoon and immediately disagreed: picking "Didn't come" from
   * the funnel filtered the list while a segment stayed highlighted, so the row claimed one thing
   * and the list showed another. The exceptions (didn't come, cancelled) map to no segment at all,
   * which is honest — no segment is showing that list — and the funnel's count says so instead.
   */
  const tab: (typeof TABS)[number] | null =
    statusFilter === '' ? 'all' : statusFilter === 'confirmed' ? 'todo' : statusFilter === 'completed' ? 'completed' : null;

  const statusWord = (status: string): string | null =>
    status === 'confirmed' ? ts('confirmed') : status === 'completed' ? ts('done') : status === 'no_show' ? ts('didNotCome') : null;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);
  const rows = filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  // The timeline is grouped BY START TIME, not one row per booking: two
  // bookings at 9:00 share a single time marker and sit side by side under it,
  // with a "N bookings at the same time" badge above them. A flat one-row-per-
  // booking list repeated the same "9:00 AM" twice and gave no hint the two
  // overlapped, which is exactly the thing an owner needs to spot.
  //
  // Rows carry only a clock time, which is unambiguous for a single day and
  // actively misleading across a From/To range: 9:00 on the 28th and 9:00 on
  // the 29th render as two identical "9:00 AM" markers, reading as duplicates
  // within one day. So slots also carry the day they belong to, and the render
  // puts a heading in whenever that day changes.
  const dayKeyOf = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return (iso: string) => fmt.format(new Date(iso));
  }, [timezone]);

  const slots = useMemo(() => {
    const byStart = new Map<string, BookingGroup[]>();
    for (const b of rows) {
      const at = byStart.get(b.startAt);
      if (at) at.push(b);
      else byStart.set(b.startAt, [b]);
    }
    return [...byStart.entries()].map(([startAt, items]) => ({
      startAt,
      items,
      dayKey: dayKeyOf(startAt),
    }));
  }, [rows, dayKeyOf]);

  // Keyed off the whole filtered range, NOT just this page: page 1 of a
  // 27–30 Aug range can happen to be all one day, and suppressing the heading
  // there leaves the reader with bare clock times under a "27 Aug – 30 Aug"
  // title, still unable to tell which day they're looking at. A single-day
  // filter gains nothing from a heading, so it stays off there.
  const multiDay = useMemo(() => new Set(filtered.map((b) => dayKeyOf(b.startAt))).size > 1, [filtered, dayKeyOf]);

  const openBooking = (b: BookingGroup) => setOpen(b);

  /**
   * GRW-166 — a salon can withhold the client's identity from its staff, and
   * an absent `customerPhone` means exactly that. No call button then: one
   * that dials an empty `tel:` is worse than none, because it looks like the
   * product is broken rather than like the owner made a choice.
   */
  const actionFor = (b: BookingGroup) =>
    b.status === 'confirmed' && b.customerPhone ? (
      <a
        className="call"
        href={`tel:${dialable(b.customerPhone)}`}
        aria-label={t('callName', { name: b.customerName ?? t('customer') })}
        onClick={(e) => e.stopPropagation()}
      >
        <IconPhone />
      </a>
    ) : (
      <button
        type="button"
        className="btn btn-ghost bk-details"
        onClick={(e) => {
          e.stopPropagation();
          openBooking(b);
        }}
      >
        <IconCalendar />
        {t('details')}
      </button>
    );

  const cardInner = (b: BookingGroup) => {
    const chip = statusChip(b);
    // First provider only, even for a multi-staff combo — one rail colour per
    // card reads clearer than trying to blend two, and the full list still
    // shows in the staff line below (GRW-46).
    const staffName = b.providerNames[0];
    const railStyle = staffName
      ? ({ '--bk-rail': railColorFor(staffName), '--bk-staff-bg': staffBgFor(staffName), '--bk-staff-ink': staffInkFor(staffName) } as CSSProperties)
      : undefined;
    const [clock, meridiem] = formatTime(b.startAt, timezone).split(' ');
    return (
      <div className="bk-card" style={railStyle} onClick={() => openBooking(b)} key={b.key}>
        <div className="bk-card-left">
          {/* Mobile only: mobile drops the timeline's left gutter entirely
              (no room for it on a phone), so the card has to carry its own
              time + duration and its own status chip — matching the mobile
              mock. Desktop keeps both in the gutter / right column instead. */}
          <div className="bk-card-timerow">
            <span className="bk-card-time">
              {clock} <span>{meridiem}</span> · {formatDuration(b.totalMin, locale)}
            </span>
            <span className={`chip ${chip.cls}`}>{ts(chip.key)}</span>
          </div>
          <div className="bk-card-name-row">
            {/*
              GRW-166 — `customerName` ABSENT means the salon withholds it from
              staff; `null` means a client with no name on file, which is why
              those two do not collapse into one placeholder.

              2026-10-04 — the reference is drawn only when there is no name to draw. It used to sit
              on every card in monospace at the weight of the client's name, and nobody reads a
              booking reference except while someone is quoting it down the phone: it is in the
              booking's own sheet, and search still matches on it. Withheld names still need it,
              because then it is the only thing identifying the card.
            */}
            {clientNameLabel(b) !== null ? (
              <div className="bk-card-name">{clientNameLabel(b)}</div>
            ) : (
              <span className="bk-card-ref">{bookingRef(b.appointments[0]!.id)}</span>
            )}
          </div>
          {b.offerTitle && (
            <div className="bk-card-combo">
              <span className="chip chip-combo"><IconPackages /> {b.offerTitle}</span>
            </div>
          )}
          <div className="bk-card-services">{summarizeServices(b.serviceNames, locale)}</div>
          {b.customerPhone ? (
            <div className="bk-card-phone">
              <IconPhone />
              {b.customerPhone}
            </div>
          ) : null}
          <div className="bk-card-bottom-row">
            {/* Desktop only: mobile already shows duration in .bk-card-timerow
                above, so repeating it here would print it twice on a phone. */}
            <span className="bk-card-dur">
              <IconClock />
              {formatDuration(b.totalMin, locale)}
            </span>
            {b.providerNames.length > 0 && (
              <div className="bk-card-staff">
                {staffName && <span className="bk-card-staff-avatar">{staffName.charAt(0).toUpperCase()}</span>}
                {b.providerNames.join(', ')}
              </div>
            )}
            {/* Jira GRW-480 (Q-1) — no price at all when the API withheld it, never a "₹0" that reads as free. */}
            {pricesShown(b) && <span className="bk-card-price">{formatMoney(String(bookingTotalMinor(b)))}</span>}
          </div>
        </div>
        <div className="bk-card-right">
          <span className={`chip ${chip.cls}`}>{ts(chip.key)}</span>
          {actionFor(b)}
        </div>
      </div>
    );
  };

  return (
    <>
      {/*
        * Jira GRW-216 — the stylist's own takings.
        *
        * Only rendered when the route answered, which is only when the owner
        * turned it on for THIS person. A salaried stylist gets no card rather
        * than a zero — showing ₹0 to somebody paid a wage invites them to think
        * their work went unrecorded, which is the exact anxiety this feature
        * exists to remove for the people on a share.
        *
        * Above the day's KPIs because for somebody on revenue share it is the
        * number they opened the app for.
        */}
      {earnings && (
        <div className="bk-earnings">
          <div className="bk-earnings-head">{t('yourEarnings')}</div>
          <div className="bk-earnings-figures">
            <div className="bk-earnings-slice">
              <div className="bk-earnings-amount">{formatMoney(earnings.today.revenueMinor)}</div>
              <div className="bk-earnings-label">
                {t('earningsToday', { count: earnings.today.bookings })}
              </div>
            </div>
            <div className="bk-earnings-slice">
              <div className="bk-earnings-amount">{formatMoney(earnings.thisMonth.revenueMinor)}</div>
              <div className="bk-earnings-label">
                {t('earningsMonth', { count: earnings.thisMonth.bookings })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/*
        Jira GRW-220 — no figures at all when the list could not be fetched.
        Four zeros sitting above a banner that says "could not load" is the same
        false statement the banner exists to withdraw, only in larger type. A
        number the screen cannot stand behind should not be on screen.
      */}
      {/* Jira GRW-310 — the way out of Home's "not marked" narrowing, which the Status dropdown
          cannot show. Only present when a person arrived that way. */}
      {unmarkedOnly && (
        <div className="bk-unmarked-chip" role="status">
          <IconClock />
          <span>{t('unmarkedOnly', { count: filtered.length })}</span>
          <button type="button" onClick={() => { setUnmarkedOnly(false); setPage(1); }}>
            {t('unmarkedClear')}
          </button>
        </div>
      )}

      {/*
        Jira GRW-488 — the tiles become a segmented control.
        All · Waiting · Booked · Done, each with its count. The tiles were a summary AND the status
        filter and hid which one was on; a segment cannot hide it. ~44px where the tiles took ~170.
      */}
      {!loadFailed && (
        <div className="page-tabs bk-tabs" role="tablist" aria-label={t('filters')}>
          {TABS.map((seg) => (
            <button
              key={seg}
              type="button"
              role="tab"
              aria-selected={tab === seg}
              className={`page-tab ${tab === seg ? 'active' : ''}`}
              onClick={() => {
                setStatusFilter(seg === 'todo' ? 'confirmed' : seg === 'completed' ? 'completed' : '');
                setPage(1);
              }}
            >
              {t(`tab_${seg}`)}
              <span className="page-tab-count">{tabCount(seg)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters sit BELOW the headline row in both mocks, not above it — the
          numbers are what the owner looks at first. Search and the staff
          select are desktop-only (mobile has its own search pill + tap chips
          inside this same card / just below it); the date range is on every
          viewport, since it's the one filter that actually re-queries. */}
      {/*
        On a phone the filters fold away (owner, 2026-10-04).

        From, To, the search pill and the sort were about 240px of controls above the day's work,
        and the dates open on today — so the commonest visit to this screen reads four filters set
        to "everything, today" before it reaches a booking. The button says when any of them is
        actually narrowing the list, so a filter can never be on without the owner seeing it.
      */}
      <div className="bk-findrow mobile-only">
        {/*
          Search is on the screen, not inside "Filters" (owner, 2026-10-04).

          It was folded away with the rest. Nobody opens a button labelled Filters looking for
          search, and `designing-for-ios.md` gives search on a list screen a primary position. It
          takes the row; the funnel beside it still holds staff, status, order and the date range
          for anyone who wants the long way round.
        */}
        <div className="bk-search-row">
          <IconSearch />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t('searchHint')}
            aria-label={t('search')}
          />
        </div>
        <button
          type="button"
          className={`bk-filter-toggle ${filtersOpen ? 'is-open' : ''}`}
          aria-expanded={filtersOpen}
          aria-controls="bk-filter-card"
          aria-label={t('filters')}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <IconFilter />
          {filterCount > 0 && <span className="bk-filter-count">{filterCount}</span>}
        </button>
      </div>
      <div id="bk-filter-card" className={`card bk-filter-card ${filtersOpen ? 'is-open' : ''}`}>
        <form method="get" className="bk-filters">
          {/* Search / staff / status / sort are client-side state, but this
              form is a real GET submit — so Show (or changing a date on
              mobile, which auto-submits) reloads the page and would drop them
              back to defaults. Carrying them as hidden inputs means the
              reload comes back with the same filters applied.

              Hidden inputs rather than `name` on the visible controls: the
              search field is rendered twice (a desktop row and a mobile
              pill, one hidden by CSS at any width) and a hidden-by-CSS input
              is still submitted, so naming both would send q twice. Only
              non-default values are emitted, so a URL stays clean until a
              filter is actually set. */}
          {customerId && <input type="hidden" name="customerId" value={customerId} />}
          {query && <input type="hidden" name="q" value={query} />}
          {staffFilter !== 'Everyone' && <input type="hidden" name="staff" value={staffFilter} />}
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {branch && <input type="hidden" name="location" value={branch.id} />}
          {sort !== 'asc' && <input type="hidden" name="sort" value={sort} />}

          <div className="bk-field bk-field-search desktop-only">
            <label htmlFor="booking-search">{t('search')}</label>
            <div className="bk-search-inline">
              <IconSearch />
              <input
                id="booking-search"
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={t('searchHint')}
              />
            </div>
          </div>

          <div className="bk-field bk-field-date">
            <label htmlFor="date">{t('from')}</label>
            <input
              id="date"
              aria-label={t('from')}
              name="date"
              type="date"
              defaultValue={date}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            <span className="field-hint">{dayHint}</span>
          </div>
          <div className="bk-field bk-field-date">
            <label htmlFor="to">{t('to')}</label>
            <input
              id="to"
              aria-label={t('to')}
              name="to"
              type="date"
              defaultValue={toDate}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </div>
          {/*
            The staff filter is this dropdown at every width now (2026-10-04).

            It was `desktop-only`, because the phone had `StaffTable` instead — six rows by four
            columns, above the day's schedule. That table is gone (it cost ~340px above the thing
            the screen is for), and when it went it took the phone's only way to filter by staff
            with it. The dropdown is the same control the laptop has always used, and on a phone it
            sits inside the filter panel that folds away, which is where a filter belongs.
          */}
          {!viewerIsStaff && (
          <div className="bk-field bk-field-staff">
            <label htmlFor="bk-staff-select">{t('staff')}</label>
            <select
              id="bk-staff-select"
              value={staffFilter}
              onChange={(e) => {
                setStaffFilter(e.target.value);
                setPage(1);
              }}
            >
              {staffChipNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          )}
          {/* Status, order — both client-side like search and staff: they
              narrow/reorder the range already loaded, never re-query. Each
              carries its own mark (funnel = narrowing, up/down arrows =
              reordering) so the two are told apart at a glance rather than by
              reading two similar-looking dropdowns. */}
          <div className="bk-field bk-field-status">
            <label htmlFor="bk-status">
              <IconFilter />
              {t('statusLabel')}
            </label>
            <select
              id="bk-status"
              aria-label={t('statusLabel')}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              {/* Confirmed and Completed are the segments' now; what is left here is the two
                  exceptions, which deserve no segment of their own because on most days they are
                  empty and a segment that is always 0 is a quarter of the row saying nothing. */}
              <option value="">{t('allStatuses')}</option>
              <option value="no_show">{ts('didNotCome')}</option>
              <option value="cancelled">{ts('cancelled')}</option>
            </select>
          </div>

          <div className="bk-field bk-field-sort">
            <label htmlFor="bk-sort">
              <IconSort />
              {t('sort')}
            </label>
            <select
              id="bk-sort"
              aria-label={t('sort')}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as typeof sort);
                setPage(1);
              }}
            >
              <option value="asc">{t('oldestFirst')}</option>
              <option value="desc">{t('newestFirst')}</option>
            </select>
          </div>

          {/* No submit button: every control here applies on selection. The
              four client-side ones (search, staff, status, order) never
              needed one, and both date fields submit the form themselves on
              change — so a "Show" button could only ever repeat what had
              already happened, which reads as "my change didn't take until I
              press this". The form element stays: it is what carries the
              dates, and the hidden inputs above, through that submit. */}
        </form>
      </div>

      {/*
        Jira GRW-487 — the people waiting, above the day's timed rows — and above the empty state.

        Somebody standing in the salon comes before a visit booked for four o'clock. Out of the tiles
        above, too — a waiting person is not a booking, and counting them there would make that
        figure disagree with Reports.

        Jira GRW-489 — and the row is where the token is worked, not a trip to Home.

        It used to be a link to the board (`/#hm-queue`), which read as a dead end: a receptionist who
        taps the person standing in front of them lands on a different screen and has to find the same
        row again. The row opens the token's own sheet instead — give it to a stylist, take the money,
        or mark them gone — the same three the board offers, from the same component, so there is one
        answer to "what can I do with a token" and not two that drift.

        Outside the "no bookings that day" branch, which is where this first sat: a morning of
        walk-ins and nothing booked is the case this whole feature exists for, and it was the one
        case that drew "No bookings that day" over a queue with two people in it.
      */}
      {isToday && waiting === null && (
        <div className="bk-waiting bk-waiting-error" role="status">
          {t('queueUnreadable')}
        </div>
      )}
      {isToday && waiting !== null && waiting.length > 0 && (tab === 'all' || tab === 'todo') && (
        <section className="bk-waiting" aria-label={t('waitingTitle')}>
          <div className="bk-waiting-head">
            <h2>{t('waitingTitle')}</h2>
            <span className="bk-waiting-count">{waiting.length}</span>
          </div>
          <ul className="bk-waiting-list">
            {(phone ? waiting.slice(0, waitingShown) : waiting).map((w) => (
              <li key={w.id}>
                {/*
                  The row is the control, so the whole 56px of it is the target rather than a button
                  squeezed in beside the name. A role that may do neither thing keeps the old link to
                  the board: a button that can only answer 403 is worse than a trip to Home.
                */}
                {mayGive || mayRecordPayment ? (
                  <button
                    type="button"
                    className="bk-waiting-row"
                    aria-label={mayGive ? hc.giveTitle(w.customerName) : `${hc.recordPayment} · ${w.customerName}`}
                    onClick={() => (mayGive ? setGiving(w) : setPayingToken(w))}
                  >
                    {waitingRow(w)}
                  </button>
                ) : (
                  <a className="bk-waiting-row" href={branch ? `/?location=${encodeURIComponent(branch.id)}#hm-queue` : '/#hm-queue'}>
                    {waitingRow(w)}
                  </a>
                )}
              </li>
            ))}
            {phone && waiting.length > waitingShown ? (
              <li className="bk-waiting-more">
                <button type="button" onClick={() => setWaitingShown((n) => n + SHOW_STEP)}>
                  {t('showMore', { count: Math.min(SHOW_STEP, waiting.length - waitingShown) })}
                </button>
              </li>
            ) : null}
          </ul>
        </section>
      )}


      {bookings.length === 0 ? (
        <div className="card">
          {loadFailed ? (
            /*
             * Jira GRW-220 — "could not load", never "nothing booked".
             *
             * A banner rather than the quiet grey `.empty` line, because this
             * is not a calm fact about the day: something failed and the owner
             * needs to know the number above is not their business.
             */
            <div className="banner">
              <strong>{te('bookingsUnavailable')}</strong> {te('bookingsUnavailableHelp')}
            </div>
          ) : (
            <div className="empty">{emptyMessage}</div>
          )}
        </div>
      ) : (
        <>
      {/*
        `StaffTable` is gone (2026-10-04).

        It was never on the laptop — `.bk-staff-table-wrap` is `display: none` until 860px, and the
        laptop has always used the Staff dropdown in the filter card. So the table was the PHONE's
        staff filter, sitting as six rows by four columns between the filters and the day's
        schedule: about 340px of roster above two bookings. The dropdown above serves both widths
        now, from inside the panel that folds away. The component is in the history if the table is
        ever wanted back.
      */}

      {/*
        The date is From/To, in view (owner, 2026-10-04).

        This was a day stepper for an afternoon — ‹ Today › — which is the right control when you
        walk a day at a time, and the wrong one when you want "the first week of October". The two
        fields are what the owner asked for and they are no longer folded away: they sit under the
        search row, and only staff, status and order wait behind the funnel.
      */}

      <div className="bk-sched-head">
        <h2>
          {isToday ? t('scheduleToday') : t('scheduleOn', { day: dayLabel })}
          <span className="bk-sched-count">{t('bookingCount', { count: filtered.length })}</span>
        </h2>
        {/* Segmented Timeline | List, both always visible with the active one
            highlighted (per the mock) — the old single pill toggled blind, so
            you couldn't see which view you'd land in until after tapping. */}
        <div className="bk-view">
          <button
            type="button"
            className={`bk-view-tab ${view === 'timeline' ? 'is-active' : ''}`}
            onClick={() => setView('timeline')}
          >
            <IconClock />
            {t('viewTimeline')}
          </button>
          <button
            type="button"
            className={`bk-view-tab ${view === 'list' ? 'is-active' : ''}`}
            onClick={() => setView('list')}
          >
            <IconMenu />
            {t('viewList')}
          </button>
        </div>
      </div>

      <div className="bk-scroll">
      {noMatches ? (
        <div className="bk-no-matches">
          <div className="bk-no-matches-title">{t('noneFound')}</div>
          <div className="bk-no-matches-sub">{t('noneFoundHint')}</div>
        </div>
      ) : view === 'timeline' ? (
        <div className="bk-timeline">
          {slots.map((slot, si) => {
            const [clock, meridiem] = formatTime(slot.startAt, timezone).split(' ');
            const multi = slot.items.length > 1;
            const startsNewDay = multiDay && slot.dayKey !== slots[si - 1]?.dayKey;
            return (
              <Fragment key={slot.startAt}>
                {startsNewDay && (
                  <div className="bk-day-head">{formatDateWithWeekday(slot.startAt, timezone, { locale })}</div>
                )}
              <div className="bk-tl-row">
                <div className="bk-tl-time">
                  <div className="bk-tl-clock">
                    {clock}
                    <span>{meridiem}</span>
                  </div>
                  {!multi && <div className="bk-tl-dur">{formatDuration(slot.items[0]!.totalMin, locale)}</div>}
                </div>
                <div className="bk-tl-rail">
                  <span className={`bk-tl-dot ${multi ? 'is-multi' : slot.items[0]!.status === 'confirmed' ? 'is-up' : ''}`} />
                  {si < slots.length - 1 && <span className="bk-tl-line" />}
                </div>
                <div className="bk-tl-slot">
                  {multi && (
                    <div className="bk-multi-badge">
                      <IconStaff />
                      {t('sameTime', { count: slot.items.length })}
                    </div>
                  )}
                  <div className="bk-tl-cards">{slot.items.map((b) => cardInner(b))}</div>
                </div>
              </div>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <div className="bk-list">
          {rows.map((b, i) => (
            <Fragment key={b.key}>
              {multiDay && dayKeyOf(b.startAt) !== (rows[i - 1] && dayKeyOf(rows[i - 1]!.startAt)) && (
                <div className="bk-day-head">{formatDateWithWeekday(b.startAt, timezone, { locale })}</div>
              )}
              {cardInner(b)}
            </Fragment>
          ))}
        </div>
      )}
      </div>

      {!noMatches && <Pagination page={clamped} total={filtered.length} pageSize={PAGE_SIZE} noun={noun} onChange={setPage} />}
        </>
      )}

      {open &&
        (open.status === 'completed' ? (
          <BookingSummary booking={open} timezone={timezone} onClose={() => setOpen(null)} />
        ) : (
          <BookingSheet
            canMove={canReschedule}
            appointment={open.appointments.find((a) => a.status === open.status) ?? open.appointments[0]!}
            timezone={timezone}
            onClose={() => setOpen(null)}
            comboServiceNames={open.isCombo ? open.serviceNames : undefined}
            comboTotalMin={open.totalMin}
            comboLegs={open.isCombo ? open.appointments : undefined}
          />
        ))}
      {/*
        Jira GRW-489 — the token's three answers, in the desk's own sheets.

        Record payment is handed UP out of the give sheet rather than opened inside it: one overlay at
        a time, and the till is a sheet of its own with a client, services and an amount in it.
      */}
      {giving ? (
        <GiveToStaffSheet
          t={hc}
          entry={giving}
          providers={providers}
          busy={busy}
          onClose={() => setGiving(null)}
          onRecordPayment={
            mayRecordPayment
              ? () => {
                  setPayingToken(giving);
                  setGiving(null);
                }
              : undefined
          }
        />
      ) : null}
      {payingToken ? (
        <NewVisitSheet mode="now" purpose="payment" token={payingToken} timezone={timezone} onClose={() => setPayingToken(null)} />
      ) : null}
    </>
  );
}
