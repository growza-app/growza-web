'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatMoney, formatTime, type Appointment, type MyEarnings, type Provider } from '../lib/api';
import { copy } from '../lib/copy';
import { countsAsNotMarked } from '../lib/live-state';
import { bookingBill, clientNameLabel, formatDuration, groupBookings, statusChip, summarizeServices, type BookingGroup } from '../lib/appointment-display';
import { formatDateWithWeekday } from '../lib/format';
import { BookingSheet, bookingRef, dialable } from '../components/BookingSheet';
import { BookingSummary } from '../components/BookingSummary';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconFilter,
  IconMenu,
  IconPhone,
  IconSearch,
  IconSort,
  IconStaff,
  IconUserPlus,
  IconWallet,
} from '../components/icons';

/** What the salon actually took for a booking (see `bookingBill`). */
function bookingTotalMinor(b: BookingGroup): number {
  return bookingBill(b.appointments).totalMinor;
}

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

/** Individual service names across every booking, not the booking count — a 3-service combo counts toward all three. */
function topServiceName(bookings: BookingGroup[]): string | null {
  const tally = new Map<string, number>();
  for (const b of bookings) for (const s of b.serviceNames) tally.set(s, (tally.get(s) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, n] of tally) if (n > bestCount) [best, bestCount] = [name, n];
  return best;
}

/** Every distinct provider a booking touched, not just the first leg — a combo split across two staff counts toward both. */
function busiestStaffName(bookings: BookingGroup[]): string | null {
  const tally = new Map<string, number>();
  for (const b of bookings) for (const name of b.providerNames) tally.set(name, (tally.get(name) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, n] of tally) if (n > bestCount) [best, bestCount] = [name, n];
  return best;
}

// `value` widened to string so the revenue tile can carry a formatted amount alongside the plain counts.
function Kpi({
  tone,
  icon,
  value,
  label,
  sub,
  className,
  active,
  onPress,
}: {
  tone: string;
  icon: ReactNode;
  value: number | string;
  label: string;
  sub: string;
  /** e.g. "desktop-only" — the Revenue tile hides on mobile in favour of the "at a glance" metric card (GRW-46). */
  className?: string;
  /**
   * Jira GRW-308 — a tile that filters the list. `active` is whether it is the
   * filter in force; `onPress` toggles it. Absent, the tile is a plain figure.
   */
  active?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <span className={`bk-kpi-icon bk-kpi-${tone}`}>{icon}</span>
      <div className="bk-kpi-text">
        <div className="bk-kpi-value">{value}</div>
        <div className="bk-kpi-label">{label}</div>
        <div className={`bk-kpi-sub bk-kpi-sub-${tone}`}>{sub}</div>
      </div>
    </>
  );
  // The "Today" / "Next 2 hrs" sub-line is dropped at narrower widths
  // (there is no room for it in a quarter-width tile), which leaves the
  // counts with nothing saying WHICH day they cover. The tooltip carries
  // that on hover, and aria-label gives a screen reader the same sentence
  // rather than three unlabelled numbers in a row.
  const name = `${value} ${label}, ${sub}`;
  if (onPress) {
    return (
      <button type="button" className={`bk-kpi bk-kpi-btn ${active ? 'is-active' : ''} ${className ?? ''}`} title={`${label} — ${sub}`} aria-label={name} aria-pressed={active} onClick={onPress}>
        {body}
      </button>
    );
  }
  return (
    <div className={`bk-kpi ${className ?? ''}`} title={`${label} — ${sub}`} aria-label={name}>
      {body}
    </div>
  );
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
  openAppointmentId,
  viewerIsStaff,
  earnings,
  capacityMin,
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
  /** Jira GRW-216 — null when the owner has not shown this stylist their takings, or the viewer is not one. */
  earnings?: MyEarnings | null;
  /**
   * Jira GRW-63 · GRW-168 — minutes this roster is actually rostered for over
   * the range on screen, from `working_hours` minus `time_block`.
   *
   * `null` means the API could not say — the range is wider than it will
   * compute, or the call failed. Not 0: nobody rostered and "we don't know"
   * are different answers, and only one of them should be shown as 0%.
   */
  capacityMin: number | null;
}) {
  // The server's clock at render. Every redraw (LiveRefresh forces one a minute) brings a fresh
  // `nowISO`, so nothing here needs a timer of its own.
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'timeline' | 'list'>('timeline');
  const [open, setOpen] = useState<BookingGroup | null>(null);
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
  // Earliest-first by default: on today's schedule that's the running order of
  // the day, which is what the page is for. Latest-first earns its keep on a
  // From/To range, where the most recent day is usually the interesting end.
  const [sort, setSort] = useState<'asc' | 'desc'>(initialSort);
  // Which figure the "at a glance" card shows — the KPI row's 5th column on
  // desktop (GRW-47), a full-width row below the 2x2 grid on mobile (GRW-46).
  const [metric, setMetric] = useState<'busy' | 'staff' | 'service'>('busy');

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
  // KPI row above and the "at a glance" metric card both stay computed from
  // the full day, matching how a real dashboard's headline counts shouldn't
  // reshuffle just because the owner typed into a search box.
  const q = query.trim().toLowerCase();
  const matchesQuery = (b: BookingGroup) =>
    !q ||
    [bookingRef(b.appointments[0]!.id), b.customerName ?? '', ...b.providerNames, b.customerPhone ?? ''].some((f) =>
      f.toLowerCase().includes(q),
    );
  const matchesStaff = (b: BookingGroup) => staffFilter === 'Everyone' || b.providerNames.includes(staffFilter);
  const matchesStatus = (b: BookingGroup) => !statusFilter || b.status === statusFilter;
  // What the tiles count: everything that matches the search and the staff chips, before the
  // status is applied (the status is what the tiles choose between; see `statusTile`).
  const inView = bookings.filter((b) => matchesStaff(b) && matchesQuery(b));
  const matching = inView.filter(matchesStatus).filter((b) => !unmarkedOnly || countsAsNotMarked(b, now));
  // groupBookings already returns ascending by start time, so descending is a
  // reverse rather than a second sort — and reversing keeps bookings that
  // share a start instant adjacent, which the slot grouping below depends on.
  const filtered = sort === 'desc' ? [...matching].reverse() : matching;
  const filtering = q !== '' || staffFilter !== 'Everyone' || statusFilter !== '' || unmarkedOnly || branch !== null;
  const noMatches = filtering && filtered.length === 0;

  const staffChipNames = useMemo(() => ['Everyone', ...providers.map((p) => p.displayName)], [providers]);


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
   *
   * The metric card below deliberately stays whole-day — its labels all say "today", so it
   * reads as a day fact rather than a description of the list.
   */
  const countIn = (status: string) => inView.filter((b) => b.status === status).length;
  const statusTile = (status: string) => ({
    active: statusFilter === status,
    onPress: () => {
      setStatusFilter(statusFilter === status ? '' : status);
      setPage(1);
    },
  });

  /**
   * Mobile-only (GRW-46) "at a glance" card: booked minutes over rostered
   * minutes.
   *
   * Both halves are now real, and it took two fixes to get there.
   *
   * GRW-190 — the two halves have to describe the same PEOPLE. They didn't:
   * `bookings` was scoped to the signed-in stylist and the roster was the
   * whole salon, so Bhavna's screen divided her 135 minutes by ten stylists'
   * capacity and told her she was 3% busy on a day that was a quarter full.
   *
   * GRW-168 — and the same DAYS, on the real schedule. The denominator was
   * `roster size × an assumed nine-hour day`, an assumption written into this
   * component: wrong for every salon that doesn't open 9-to-6, wrong again for
   * any stylist who overrides their own hours, and wrong by a whole multiple
   * over a From/To range, where a week of bookings was divided by one day.
   * `capacityMin` comes from `working_hours` minus `time_block` over exactly
   * the range on screen, so a half-day Sunday, a lunch gap and a colleague
   * marked off sick all count for what they are.
   *
   * Null capacity is NOT zero: it means the API declined to say (a range wider
   * than a month, or a failed call), and the card shows no figure rather than
   * an authoritative-looking 0%.
   */
  const bookedMin = bookings.reduce((sum, b) => sum + b.totalMin, 0);
  // Jira GRW-312 — with one branch picked the minutes are that branch's and `capacityMin` is the whole
  // business's: the mismatch GRW-190 fixed for a stylist. No figure until the capacity is per branch.
  const staffBusyPct = capacityMin && capacityMin > 0 && !branch ? Math.round((bookedMin / capacityMin) * 100) : null;
  const busiestStaff = busiestStaffName(bookings);
  const topService = topServiceName(bookings);
  const metricValue =
    metric === 'staff'
      ? (busiestStaff ?? '—')
      : metric === 'service'
        ? (topService ?? '—')
        : staffBusyPct === null
          ? '—'
          : `${staffBusyPct}%`;
  // "today" only when the screen is showing one day. Over a From/To range the
  // figure covers every day in it, and the old label said otherwise.
  const oneDay = date === toDate;
  const metricLabel =
    metric === 'staff'
      ? `Busiest staff ${oneDay ? 'today' : 'in this range'}`
      : metric === 'service'
        ? `${viewerIsStaff ? 'Your top service' : 'Top service'} ${oneDay ? 'today' : 'in this range'}`
        : viewerIsStaff
          ? `Your ${oneDay ? 'day' : 'time'} booked`
          : `Staff busy ${oneDay ? 'today' : 'in this range'}`;

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
        aria-label={`Call ${b.customerName ?? 'customer'}`}
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
        Details
      </button>
    );

  const cardInner = (b: BookingGroup) => {
    const chip = statusChip(b);
    // First provider only, even for a multi-staff combo — one rail colour per
    // card reads clearer than trying to blend two, and the full list still
    // shows in the staff line below (GRW-46).
    const staffName = b.providerNames[0];
    const railStyle = staffName
      ? ({ '--bk-rail': railColorFor(staffName), '--bk-staff-bg': staffBgFor(staffName) } as CSSProperties)
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
              {clock} <span>{meridiem}</span> · {formatDuration(b.totalMin)}
            </span>
            <span className={`chip ${chip.cls}`}>{chip.text}</span>
          </div>
          <div className="bk-card-name-row">
            {/*
              GRW-166 — `customerName` ABSENT means the salon withholds it from
              staff; `null` means a client with no name on file, which is why
              those two do not collapse into one placeholder. Withheld, the row
              still carries the booking reference, so the card keeps something
              to identify the booking by.
            */}
            {clientNameLabel(b) !== null ? <div className="bk-card-name">{clientNameLabel(b)}</div> : <div />}
            <span className="bk-card-ref">{bookingRef(b.appointments[0]!.id)}</span>
          </div>
          {b.offerTitle && (
            <div className="bk-card-combo">
              <span className="chip chip-combo">🎁 {b.offerTitle}</span>
            </div>
          )}
          <div className="bk-card-services">{summarizeServices(b.serviceNames)}</div>
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
              {formatDuration(b.totalMin)}
            </span>
            {b.providerNames.length > 0 && (
              <div className="bk-card-staff">
                {staffName && <span className="bk-card-staff-avatar">{staffName.charAt(0).toUpperCase()}</span>}
                {b.providerNames.join(', ')}
              </div>
            )}
            <span className="bk-card-price">{formatMoney(String(bookingTotalMinor(b)))}</span>
          </div>
        </div>
        <div className="bk-card-right">
          <span className={`chip ${chip.cls}`}>{chip.text}</span>
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
          <div className="bk-earnings-head">{copy.bookings.yourEarnings}</div>
          <div className="bk-earnings-figures">
            <div className="bk-earnings-slice">
              <div className="bk-earnings-amount">{formatMoney(earnings.today.revenueMinor)}</div>
              <div className="bk-earnings-label">
                {copy.bookings.earningsToday(earnings.today.bookings)}
              </div>
            </div>
            <div className="bk-earnings-slice">
              <div className="bk-earnings-amount">{formatMoney(earnings.thisMonth.revenueMinor)}</div>
              <div className="bk-earnings-label">
                {copy.bookings.earningsMonth(earnings.thisMonth.bookings)}
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
          <span>{copy.bookings.unmarkedOnly(filtered.length)}</span>
          <button type="button" onClick={() => { setUnmarkedOnly(false); setPage(1); }}>
            {copy.bookings.unmarkedClear}
          </button>
        </div>
      )}

      {branch && (
        <div className="bk-unmarked-chip bk-branch-chip" role="status">
          <IconStaff />
          <span>{copy.bookings.branchOnly(branch.name)}</span>
          <button
            type="button"
            onClick={() => {
              setBranch(null);
              setPage(1);
              // The address said this branch; leaving it there would bring it back on a reload.
              const url = new URL(window.location.href);
              if (url.searchParams.has('location')) {
                url.searchParams.delete('location');
                window.history.replaceState(null, '', url);
              }
            }}
          >
            {copy.bookings.branchClear}
          </button>
        </div>
      )}

      {!loadFailed && (
      <div className="bk-kpis">
        <Kpi
          tone="green"
          icon={<IconCalendar />}
          value={inView.length}
          label="Bookings"
          sub={isToday ? 'Today' : dayLabel}
          active={statusFilter === ''}
          onPress={() => {
            setStatusFilter('');
            setPage(1);
          }}
        />
        <Kpi tone="amber" icon={<IconClock />} value={countIn('confirmed')} label={copy.status.confirmed} sub={isToday ? 'Today' : dayLabel} {...statusTile('confirmed')} />
        <Kpi tone="purple" icon={<IconCheck />} value={countIn('completed')} label={copy.status.done} sub={isToday ? 'Today' : dayLabel} {...statusTile('completed')} />
        <Kpi tone="red" icon={<IconUserPlus />} value={countIn('no_show')} label={copy.status.didNotCome} sub={isToday ? 'Today' : dayLabel} {...statusTile('no_show')} />

        {/* "At a glance" — the KPI row's 5th column on desktop (Bookings.dc.html,
            GRW-47), and its own full-width row below the 2x2 grid on mobile
            (Bookings Mobile.dc.html, GRW-46) — one card, reflowed per viewport
            in CSS only. Replaces the old static Revenue tile, exactly as the
            mock does (Revenue itself isn't shown here any more). */}
        <div className="bk-metric-card">
          <div className="bk-metric-top">
            <span className="bk-metric-icon">
              <IconWallet />
            </span>
            <select
              className="bk-metric-select"
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
            >
              <option value="busy">{viewerIsStaff ? 'My day' : 'Staff busy'}</option>
              {/* "Busiest staff" over a one-person roster can only ever name
                  the reader. Offered to owners and managers only. */}
              {!viewerIsStaff && <option value="staff">Busiest staff</option>}
              <option value="service">Top service</option>
            </select>
          </div>
          <div className="bk-metric-main">
            <div className="bk-metric-value">{metricValue}</div>
            <div className="bk-metric-label">{metricLabel}</div>
          </div>
          {metric === 'busy' && staffBusyPct !== null && (
            <div className="bk-metric-bar">
              <div className="bk-metric-bar-fill" style={{ width: `${Math.min(100, Math.max(0, staffBusyPct))}%` }} />
            </div>
          )}
        </div>
      </div>
      )}

      {/* Filters sit BELOW the headline row in both mocks, not above it — the
          numbers are what the owner looks at first. Search and the staff
          select are desktop-only (mobile has its own search pill + tap chips
          inside this same card / just below it); the date range is on every
          viewport, since it's the one filter that actually re-queries. */}
      <div className="card bk-filter-card">
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
            <label htmlFor="booking-search">{copy.bookings.search}</label>
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
                placeholder={copy.bookings.searchHint}
              />
            </div>
          </div>

          {/* Mobile's own search pill — same client-side query state as the
              desktop field above (BR-01/BR-02), just the compact shape the
              mobile mock uses, and inside the card so it lands above the
              date range the way that mock orders them. */}
          <div className="bk-field bk-field-search mobile-only">
            <div className="bk-search-row">
              <IconSearch />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={copy.bookings.searchHint}
                aria-label={copy.bookings.search}
              />
            </div>
          </div>

          <div className="bk-field">
            <label htmlFor="date">{copy.bookings.from}</label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={date}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            <span className="field-hint">{dayHint}</span>
          </div>
          <div className="bk-field">
            <label htmlFor="to">{copy.bookings.to}</label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={toDate}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </div>
          {!viewerIsStaff && (
          <div className="bk-field bk-field-staff desktop-only">
            <label htmlFor="bk-staff-select">{copy.bookings.staff}</label>
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
              {copy.bookings.statusLabel}
            </label>
            <select
              id="bk-status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{copy.bookings.allStatuses}</option>
              <option value="confirmed">{copy.status.confirmed}</option>
              <option value="completed">{copy.status.done}</option>
              <option value="no_show">{copy.status.didNotCome}</option>
              <option value="cancelled">{copy.status.cancelled}</option>
            </select>
          </div>

          <div className="bk-field bk-field-sort">
            <label htmlFor="bk-sort">
              <IconSort />
              {copy.bookings.sort}
            </label>
            <select
              id="bk-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as typeof sort);
                setPage(1);
              }}
            >
              <option value="asc">{copy.bookings.oldestFirst}</option>
              <option value="desc">{copy.bookings.newestFirst}</option>
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
              <strong>{copy.errors.bookingsUnavailable}</strong> {copy.errors.bookingsUnavailableHelp}
            </div>
          ) : (
            <div className="empty">{emptyMessage}</div>
          )}
        </div>
      ) : (
        <>
      {!viewerIsStaff && (
      <div className="bk-staff-chips">
        {staffChipNames.map((name) => (
          <button
            key={name}
            type="button"
            className={`bk-staff-chip ${staffFilter === name ? 'is-active' : ''}`}
            onClick={() => {
              setStaffFilter(name);
              setPage(1);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      )}

      <div className="bk-sched-head">
        <h3>
          {isToday ? copy.bookings.scheduleToday : `${dayLabel} schedule`}
          <span className="bk-sched-count">{copy.bookings.bookingCount(filtered.length)}</span>
        </h3>
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
            {copy.bookings.viewTimeline}
          </button>
          <button
            type="button"
            className={`bk-view-tab ${view === 'list' ? 'is-active' : ''}`}
            onClick={() => setView('list')}
          >
            <IconMenu />
            {copy.bookings.viewList}
          </button>
        </div>
      </div>

      <div className="bk-scroll">
      {noMatches ? (
        <div className="bk-no-matches">
          <div className="bk-no-matches-title">{copy.bookings.noneFound}</div>
          <div className="bk-no-matches-sub">{copy.bookings.noneFoundHint}</div>
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
                  <div className="bk-day-head">{formatDateWithWeekday(slot.startAt, timezone)}</div>
                )}
              <div className="bk-tl-row">
                <div className="bk-tl-time">
                  <div className="bk-tl-clock">
                    {clock}
                    <span>{meridiem}</span>
                  </div>
                  {!multi && <div className="bk-tl-dur">{formatDuration(slot.items[0]!.totalMin)}</div>}
                </div>
                <div className="bk-tl-rail">
                  <span className={`bk-tl-dot ${multi ? 'is-multi' : slot.items[0]!.status === 'confirmed' ? 'is-up' : ''}`} />
                  {si < slots.length - 1 && <span className="bk-tl-line" />}
                </div>
                <div className="bk-tl-slot">
                  {multi && (
                    <div className="bk-multi-badge">
                      <IconStaff />
                      {copy.bookings.sameTime(slot.items.length)}
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
                <div className="bk-day-head">{formatDateWithWeekday(b.startAt, timezone)}</div>
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
            canSettle={!viewerIsStaff}
            canMove={!viewerIsStaff && canReschedule}
            appointment={open.appointments.find((a) => a.status === open.status) ?? open.appointments[0]!}
            timezone={timezone}
            onClose={() => setOpen(null)}
            comboServiceNames={open.isCombo ? open.serviceNames : undefined}
            comboTotalMin={open.totalMin}
            comboLegs={open.isCombo ? open.appointments : undefined}
          />
        ))}
    </>
  );
}
