'use client';

import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { formatMoney, formatTime, type Appointment, type Provider } from '../lib/api';
import { copy } from '../lib/copy';
import { formatDuration, groupBookings, statusChip, summarizeServices, type BookingGroup } from '../lib/appointment-display';
import { BookingSheet, bookingRef, dialable } from '../components/BookingSheet';
import { BookingSummary } from '../components/BookingSummary';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { IconCalendar, IconCheck, IconClock, IconMenu, IconPhone, IconSearch, IconStaff, IconUserPlus, IconWallet } from '../components/icons';

/** What the salon actually took for a booking: services paid, minus any combo discount. */
function bookingTotalMinor(b: BookingGroup): number {
  const subtotal = b.appointments.reduce((sum, a) => sum + Number(a.paidAmountMinor ?? a.priceMinor ?? 0), 0);
  const comboLegs = b.appointments.filter((a) => a.offerTitle);
  const comboList = comboLegs.reduce((sum, a) => sum + Number(a.priceMinor ?? 0), 0);
  const comboPrice = comboLegs.find((a) => a.comboPriceMinor)?.comboPriceMinor;
  const savings = comboPrice ? Math.max(0, comboList - Number(comboPrice)) : 0;
  return subtotal - savings;
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
}: {
  tone: string;
  icon: ReactNode;
  value: number | string;
  label: string;
  sub: string;
  /** e.g. "desktop-only" — the Revenue tile hides on mobile in favour of the "at a glance" metric card (GRW-46). */
  className?: string;
}) {
  return (
    <div className={`bk-kpi ${className ?? ''}`}>
      <span className={`bk-kpi-icon bk-kpi-${tone}`}>{icon}</span>
      <div className="bk-kpi-text">
        <div className="bk-kpi-value">{value}</div>
        <div className="bk-kpi-label">{label}</div>
        <div className={`bk-kpi-sub bk-kpi-sub-${tone}`}>{sub}</div>
      </div>
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
}: {
  appointments: Appointment[];
  /** The full roster, for the mobile staff-filter chips (GRW-46) — not just staff with a booking today, so tapping a chip can honestly show "0 bookings" for someone rather than making them disappear. */
  providers: Provider[];
  timezone: string;
  noun: string;
  /** Server clock, so the first client render matches SSR before the tick starts. */
  nowISO: string;
  /** Whether the selected day (the filter's date field) is today. */
  isToday: boolean;
  /** Short label for the selected day, e.g. "21 Aug" — used everywhere the page said "Today" when it's actually showing a different day. */
  dayLabel: string;
}) {
  const [now, setNow] = useState(() => new Date(nowISO));
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'timeline' | 'list'>('timeline');
  const [open, setOpen] = useState<BookingGroup | null>(null);
  // Mobile-only (GRW-46): both filter the day's already-loaded bookings
  // client-side, independent of the date form's own GET navigation — see
  // GRW-10's BR-01 on why that form stays a full-page submit.
  const [query, setQuery] = useState('');
  const [staffFilter, setStaffFilter] = useState('Everyone');
  // Mobile-only (GRW-46): which figure the "at a glance" card shows.
  const [metric, setMetric] = useState<'busy' | 'staff' | 'service'>('busy');

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const bookings = groupBookings(appointments);

  // Mobile-only (GRW-46): search + staff chips narrow the SCHEDULE only — the
  // KPI row above and the "at a glance" metric card both stay computed from
  // the full day, matching how a real dashboard's headline counts shouldn't
  // reshuffle just because the owner typed into a search box.
  const q = query.trim().toLowerCase();
  const matchesQuery = (b: BookingGroup) =>
    !q ||
    [bookingRef(b.appointments[0]!.id), b.customerName ?? '', ...b.providerNames, b.customerPhone].some((f) =>
      f.toLowerCase().includes(q),
    );
  const matchesStaff = (b: BookingGroup) => staffFilter === 'Everyone' || b.providerNames.includes(staffFilter);
  const filtered = bookings.filter((b) => matchesStaff(b) && matchesQuery(b));
  const filtering = q !== '' || staffFilter !== 'Everyone';
  const noMatches = filtering && filtered.length === 0;

  const staffChipNames = useMemo(() => ['Everyone', ...providers.map((p) => p.displayName)], [providers]);

  const within2h = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= now.getTime() && t <= now.getTime() + 2 * 60 * 60 * 1000;
  };
  const completed = bookings.filter((b) => b.status === 'completed');
  const confirmed = bookings.filter((b) => b.status === 'confirmed');
  // "Next 2 hrs" only means something against the real clock, i.e. on today's
  // schedule. Looking at a past/future day, show the day's total confirmed
  // count instead — "next 2 hours" would silently read 0 for every other day.
  const comingUp = isToday ? confirmed.filter((b) => within2h(b.startAt)).length : confirmed.length;
  const noShow = bookings.filter((b) => b.status === 'no_show').length;
  const revenue = completed.reduce((sum, b) => sum + bookingTotalMinor(b), 0);

  // Mobile-only (GRW-46) "at a glance" card. Busy % assumes a 9-hour working
  // day per staff member — the real per-tenant working-hours configuration
  // isn't loaded on this screen, and pulling it in is a data-layer change
  // this story's own Out of Scope excludes; the booked-minutes numerator is
  // real, only that denominator is a documented stand-in.
  const workdayMin = 9 * 60;
  const staffBusyPct =
    providers.length > 0
      ? Math.round((bookings.reduce((sum, b) => sum + b.totalMin, 0) / (providers.length * workdayMin)) * 100)
      : 0;
  const busiestStaff = busiestStaffName(bookings);
  const topService = topServiceName(bookings);
  const metricValue =
    metric === 'staff' ? (busiestStaff ?? '—') : metric === 'service' ? (topService ?? '—') : `${staffBusyPct}%`;
  const metricLabel =
    metric === 'staff' ? 'Busiest staff today' : metric === 'service' ? 'Top service today' : 'Staff busy today';

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);
  const rows = filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  // Mobile only (GRW-46 follow-up): flags a cluster of bookings starting at
  // the exact same instant — a straight top-to-bottom timeline can't show
  // that on its own. Scoped to the current page's rows, same as the
  // timeline itself.
  const sameStartCount = new Map<string, number>();
  for (const b of rows) sameStartCount.set(b.startAt, (sameStartCount.get(b.startAt) ?? 0) + 1);
  const multiBadgeAt = new Set<number>();
  const badgeShownFor = new Set<string>();
  rows.forEach((b, i) => {
    if ((sameStartCount.get(b.startAt) ?? 1) > 1 && !badgeShownFor.has(b.startAt)) {
      multiBadgeAt.add(i);
      badgeShownFor.add(b.startAt);
    }
  });

  const openBooking = (b: BookingGroup) => setOpen(b);

  const actionFor = (b: BookingGroup) =>
    b.status === 'confirmed' ? (
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
    return (
      <div className="bk-card" style={railStyle} onClick={() => openBooking(b)}>
        <div className="bk-card-left">
          <div className="bk-card-name-row">
            <div className="bk-card-name">{b.customerName ?? 'Unknown'}</div>
            <span className="bk-card-ref">{bookingRef(b.appointments[0]!.id)}</span>
          </div>
          {b.offerTitle && (
            <div className="bk-card-combo">
              <span className="chip chip-combo">🎁 {b.offerTitle}</span>
            </div>
          )}
          <div className="bk-card-services">{summarizeServices(b.serviceNames)}</div>
          <div className="bk-card-phone">
            <IconPhone />
            {b.customerPhone}
          </div>
          <div className="bk-card-bottom-row">
            {b.providerNames.length > 0 ? (
              <div className="bk-card-staff">
                {staffName && <span className="bk-card-staff-avatar">{staffName.charAt(0).toUpperCase()}</span>}
                <IconStaff />
                {b.providerNames.join(', ')}
              </div>
            ) : (
              <span />
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
      <div className="bk-kpis">
        <Kpi tone="green" icon={<IconCalendar />} value={bookings.length} label="Bookings" sub={isToday ? 'Today' : dayLabel} />
        <Kpi
          tone="amber"
          icon={<IconClock />}
          value={comingUp}
          label={copy.status.confirmed}
          sub={isToday ? 'Next 2 hrs' : dayLabel}
        />
        <Kpi tone="purple" icon={<IconCheck />} value={completed.length} label={copy.status.done} sub={isToday ? 'Today' : dayLabel} />
        <Kpi tone="red" icon={<IconUserPlus />} value={noShow} label={copy.status.didNotCome} sub={isToday ? 'Today' : dayLabel} />
        {/* Revenue belongs with the other numbers for the day, not stranded
            below the list where it read as a footnote to the last booking.
            Desktop only (GRW-46): mobile trades this tile for the "at a
            glance" metric card below, which can show the same busy/staff/
            service angle the KPI row doesn't have room for on a phone. */}
        <Kpi
          tone="green"
          icon={<IconWallet />}
          value={formatMoney(String(revenue))}
          label="Revenue"
          sub={isToday ? 'Today' : dayLabel}
          className="desktop-only"
        />
      </div>

      {/* Mobile only (GRW-46): a real number that a 5th KPI tile has no room
          for on a phone, switchable rather than picking one and hiding the
          other two. */}
      <div className="bk-metric-card">
        <div className="bk-metric-main">
          <div className="bk-metric-value">{metricValue}</div>
          <div className="bk-metric-label">{metricLabel}</div>
        </div>
        <select
          className="bk-metric-select"
          value={metric}
          onChange={(e) => setMetric(e.target.value as typeof metric)}
        >
          <option value="busy">Staff busy</option>
          <option value="staff">Busiest staff</option>
          <option value="service">Top service</option>
        </select>
      </div>

      {/* Mobile only (GRW-46): both filter the already-loaded day client-side
          (see BR-01/BR-02 on the Jira story) — no relation to the date
          form's own full-page GET navigation above this component. */}
      <div className="bk-search-row">
        <IconSearch />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search bookings…"
          aria-label="Search bookings"
        />
      </div>

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

      <div className="bk-sched-head">
        <h3>
          {isToday ? "Today's schedule" : `${dayLabel} schedule`}
          <span className="bk-sched-count">{filtered.length} appts</span>
        </h3>
        <div className="bk-view">
          <button
            type="button"
            className={`bk-view-icon ${view === 'list' ? 'is-active' : ''}`}
            onClick={() => setView('list')}
            aria-label="List view"
          >
            <IconMenu />
          </button>
          <button
            type="button"
            className="bk-view-pill"
            onClick={() => setView((v) => (v === 'timeline' ? 'list' : 'timeline'))}
            aria-label="Switch view"
          >
            {view === 'timeline' ? 'Timeline' : 'List'}
            <span className="bk-view-caret" aria-hidden="true">⌄</span>
          </button>
        </div>
      </div>

      <div className="bk-scroll">
      {noMatches ? (
        <div className="bk-no-matches">
          <div className="bk-no-matches-title">No matching bookings</div>
          <div className="bk-no-matches-sub">Try a different name, staff member, phone number, or booking ID.</div>
        </div>
      ) : view === 'timeline' ? (
        <div className="bk-timeline">
          {rows.map((b, i) => {
            const [clock, meridiem] = formatTime(b.startAt, timezone).split(' ');
            return (
              <Fragment key={b.key}>
                {multiBadgeAt.has(i) && (
                  <div className="bk-multi-badge">{sameStartCount.get(b.startAt)} at the same time</div>
                )}
                <div className="bk-tl-row">
                  <div className="bk-tl-time">
                    <div className="bk-tl-clock">
                      {clock}
                      <span>{meridiem}</span>
                    </div>
                    <div className="bk-tl-dur">{formatDuration(b.totalMin)}</div>
                  </div>
                  <div className="bk-tl-rail">
                    <span className={`bk-tl-dot ${b.status === 'confirmed' ? 'is-up' : ''}`} />
                    {i < rows.length - 1 && <span className="bk-tl-line" />}
                  </div>
                  {cardInner(b)}
                </div>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <div className="bk-list">{rows.map((b) => cardInner(b))}</div>
      )}
      </div>

      {!noMatches && <Pagination page={clamped} total={filtered.length} pageSize={PAGE_SIZE} noun={noun} onChange={setPage} />}

      {open &&
        (open.status === 'completed' ? (
          <BookingSummary booking={open} timezone={timezone} onClose={() => setOpen(null)} />
        ) : (
          <BookingSheet
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
