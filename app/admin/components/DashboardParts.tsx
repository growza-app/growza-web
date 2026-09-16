'use client';

import Link from 'next/link';
import { Icon } from '../icons';
import { inr, oklch } from '../tokens';

/**
 * The Home dashboard's own small components (GRW-104/265/274) — split out of
 * `page.tsx` once that file passed the repo's 400-line lint limit, the same
 * instinct as the tenant Home's `parts.tsx`: pieces used nowhere but one
 * screen, kept next to it rather than promoted to a shared primitive they
 * aren't.
 */

export interface AttentionRow {
  key: string;
  label: string;
  available: boolean;
  count?: number;
  /** Where the count came from (GRW-119) — an available row is a way in, not a number to stare at. */
  href?: string;
  epic?: string;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** A stable tint per business, from its id — decorative only, never a status color (STATUS_COLORS owns that meaning). */
const AVATAR_TINTS = [
  { bg: 'oklch(0.93 0.045 150)', fg: 'oklch(0.45 0.12 150)' },
  { bg: 'oklch(0.92 0.045 250)', fg: 'oklch(0.5 0.15 250)' },
  { bg: 'oklch(0.94 0.055 80)', fg: 'oklch(0.52 0.13 65)' },
  { bg: 'oklch(0.93 0.05 300)', fg: 'oklch(0.5 0.14 300)' },
  { bg: 'oklch(0.94 0.05 25)', fg: 'oklch(0.5 0.14 25)' },
];
export function tintFor(key: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length]!;
}

/** GRW-274 — the quick-action tile tints. Decorative variety per action, not a status vocabulary. */
export const ACTION_TINTS = {
  businesses: { bg: 'oklch(0.95 0.04 150)', fg: 'oklch(0.45 0.12 150)' },
  users: { bg: 'oklch(0.93 0.04 250)', fg: 'oklch(0.5 0.15 250)' },
  plans: { bg: 'oklch(0.93 0.04 300)', fg: 'oklch(0.5 0.14 300)' },
  usage: { bg: 'oklch(0.96 0.05 80)', fg: 'oklch(0.52 0.13 65)' },
  audit: { bg: 'oklch(0.96 0.006 150)', fg: oklch.textMuted },
} satisfies Record<string, { bg: string; fg: string }>;

/**
 * GRW-275 — a movement line only where the comparison is a real query.
 *
 * Percentage against a previous total; `undefined` when there is nothing to
 * compare against (a first month, where "↑ 100%" would be noise rather than
 * information).
 */
export function percentDelta(current: number, previous: number): { direction: 'up' | 'down' | 'flat'; text: string } | undefined {
  if (previous === 0) return undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { direction: 'flat', text: 'no change vs last month' };
  return { direction: pct > 0 ? 'up' : 'down', text: `${Math.abs(pct)}% vs last month` };
}

/**
 * GRW-276 — percentages that add up to exactly 100.
 *
 * Rounding each share on its own is what put "Provisioning 73%" next to
 * "Active 28%" on a 29/11-of-40 split: both halves were x.5 and both rounded
 * up, so the page claimed 101% of the businesses. Largest-remainder instead —
 * floor everything, then hand the leftover points to whichever shares were
 * cheated most by the flooring. Every share is within one point of its true
 * value and the column totals what it should.
 *
 * A zero count is never given a point, so "0" can't end up reading "1%".
 */
export function wholePercentages(counts: number[]): number[] {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return counts.map(() => 0);

  const exact = counts.map((n) => (n / total) * 100);
  const out = exact.map(Math.floor);
  let leftover = 100 - out.reduce((sum, n) => sum + n, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .filter(({ index }) => counts[index]! > 0)
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; leftover > 0 && byRemainder.length > 0; i += 1, leftover -= 1) {
    const target = byRemainder[i % byRemainder.length]!.index;
    out[target] = (out[target] ?? 0) + 1;
  }
  return out;
}

/** The same idea in whole businesses rather than a percentage — what "12 more than last month" actually means. */
export function countDelta(current: number, previous: number): { direction: 'up' | 'down' | 'flat'; text: string } {
  const diff = current - previous;
  if (diff === 0) return { direction: 'flat', text: 'same as last month' };
  return { direction: diff > 0 ? 'up' : 'down', text: `${Math.abs(diff)} vs last month` };
}

/**
 * GRW-265 QA — smaller than the primitive `Card`'s default 20px padding and
 * 38px icon badge on purpose: sat two of these side by side at phone width
 * and they read as oversized blocks compared to the compact stat tiles the
 * tenant Home already uses (`hm-tile`, 83-role-home.css) — this brings the
 * proportions closer without importing that stylesheet, since GRW-95 keeps
 * the admin plane's own token set deliberately separate.
 */
/**
 * GRW-275 — the reference design's tinted stat card, matched exactly: the
 * whole card carries the tint (not just a small icon badge on white), the
 * icon sits in a lighter translucent square on the left, and label / number /
 * movement stack to its right. An "attention"-flavoured card also shows a
 * chevron, because it is a way in to the list it counted.
 *
 * `delta` is only ever passed where the movement is a REAL query (GRW-275
 * added `totalAtPeriodStart` and `newBusinesses.previous` for exactly two of
 * them). The reference puts a trend line on all four; a status-based one
 * ("active vs last month") has no history table behind it, so those cards
 * carry no movement line at all rather than an invented one.
 */
export interface StatTint {
  bg: string;
  fg: string;
  border: string;
}

/** The icons a stat card may use — a deliberate subset of the full set, so a card can't reach for an unrelated glyph. */
export type StatIcon = 'businesses' | 'trend' | 'check' | 'clock' | 'alert' | 'money';

export function StatCard({
  icon,
  label,
  value,
  href,
  tint,
  delta,
  note,
  chevron = false,
}: {
  icon: StatIcon;
  label: string;
  value: number;
  href: string;
  tint: StatTint;
  /** Real movement only. `text` is already formatted ("12% vs last month"); `direction` colours the arrow. */
  delta?: { direction: 'up' | 'down' | 'flat'; text: string };
  /** Shown in the movement row on a card that has no movement to show — never instead of a real delta. */
  note?: string;
  chevron?: boolean;
}) {
  const deltaColor =
    delta?.direction === 'up' ? 'oklch(0.5 0.13 150)' : delta?.direction === 'down' ? 'oklch(0.53 0.16 25)' : oklch.textFaint;
  return (
    // `height: '100%'` on both the link and the card: a grid item stretches to
    // the row's height by default, but that stretch stops at the <Link> box —
    // the plain <div> card inside it still sizes to its own content, so a
    // 2-line label made that card visibly taller than its 1-line sibling even
    // though the two grid cells were the same height. Reported as "card size
    // mismatch" on a real phone.
    <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      {/*
        Four grid AREAS rather than a flex row with a nested text column
        (GRW-277 QA). The flex version had one shape at every width, and on a
        phone that shape cost ~130px of a 780px screen for a number and a
        word: the label and the movement line both lived in a ~90px column
        beside the icon, so "Total businesses" took two lines, "↑ 400% vs last
        month" took two more, and "Cancellations" — one unbreakable word —
        simply ran out under the chevron.

        As areas, the phone can hand the movement line the card's FULL width
        (where it fits on one line) and drop the chevron, which is what was
        stealing the label's last 24px. Every size that differs between the
        two layouts is in `admin.css`; only the tint travels inline, because
        only the tint is per-card.
      */}
      <div className="admin-stat-card" data-chevron={chevron} style={{ background: tint.bg, border: `1px solid ${tint.border}` }}>
        <span className="admin-stat-icon" style={{ background: 'oklch(1 0 0 / 0.75)', color: tint.fg }}>
          <Icon name={icon} size={19} />
        </span>
        {/*
          The label and movement rows are FIXED height rather than sized to
          their own content, so all four cards are identical and their numbers
          sit on one line across the whole block — a one-line label used to put
          its number 15px higher than a two-line one. Inventing a movement for
          the cards that have none is the thing this dashboard does not do, so
          the space is reserved and left empty instead.
        */}
        <div className="admin-stat-label" style={{ color: oklch.textMuted }}>
          {label}
        </div>
        <div className="admin-stat-value" style={{ color: oklch.textStrong }}>
          {value.toLocaleString('en-IN')}
        </div>
        <div className="admin-stat-delta">
          {delta ? (
            <>
              <span style={{ color: deltaColor, fontWeight: 800 }}>
                {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '—'}
              </span>
              <span style={{ color: oklch.textFaint, fontWeight: 500 }}>{delta.text}</span>
            </>
          ) : note ? (
            <span style={{ color: oklch.textFaint, fontWeight: 500 }}>{note}</span>
          ) : null}
        </div>
        {/* Absolute, not a grid item: as an item it took a column out of an
            already narrow card. Hidden altogether on a phone — the whole card
            is the link, and the 24px it reserved is the difference between
            "Cancellations" fitting and not. */}
        {chevron ? (
          <span className="admin-stat-chevron" style={{ color: oklch.textFaint }}>
            <Icon name="chevronRight" size={15} />
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/** BR-01/BR-02 — unavailable and zero must look different; this is the one place that distinction is drawn. */
/**
 * Jira GRW-159 · GRW-167 — what each attention row means, in its own words.
 *
 * Keyed by the row's own key rather than written once for all of them: the
 * rows are not the same kind of problem. A failed payment is a customer who
 * tried; an uninvoiced period is a customer nobody asked. Telling an admin the
 * second one is "currently failing" sends them to the payments screen, where
 * there is nothing to find.
 */
const ATTENTION_SUBTITLES: Record<string, { clear: string; action: string }> = {
  payments_failed: { clear: 'Nothing needs attention.', action: 'Currently failing — open to reconcile.' },
  uninvoiced_periods: {
    clear: 'Every live subscription has been invoiced for its current period.',
    action: 'These salons are not being billed — check a tax rule covers their period.',
  },
  // GRW-265 — a cancellation is not a failure, so it doesn't get the default
  // "Currently failing" wording; that would misdescribe a business that
  // simply left, the same per-row-wording lesson GRW-167 established above.
  cancellations: {
    clear: 'No subscriptions cancelled this month.',
    action: 'Cancelled this month — open to see which businesses and consider following up.',
  },
};

export interface RevenueMonth {
  month: string;
  totalMinor: number;
}

/**
 * GRW-276 — collected revenue, with its own six-month bar chart.
 *
 * Hand-drawn SVG rather than a charting dependency: this repo has no chart
 * library anywhere (tenant or admin), and six bars do not justify becoming
 * the first place that changes. Bars are scaled against the window's own
 * maximum, and a zero month still draws a visible stub so the axis reads as
 * six months rather than however many happened to be non-zero.
 */
export function RevenueCard({
  months,
  thisMonthMinor,
  delta,
  className,
}: {
  months: RevenueMonth[];
  thisMonthMinor: number;
  delta?: { direction: 'up' | 'down' | 'flat'; text: string };
  /** Placement only — the dashboard's grid area. See `Card`'s own note on why this is a class. */
  className?: string;
}) {
  const max = Math.max(...months.map((m) => m.totalMinor), 1);
  const deltaColor =
    delta?.direction === 'up' ? 'oklch(0.5 0.13 150)' : delta?.direction === 'down' ? 'oklch(0.53 0.16 25)' : oklch.textFaint;
  return (
    <div className={className} style={{ background: oklch.surface, border: `1px solid ${oklch.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Revenue</h3>
        <span style={{ fontSize: 12, color: oklch.textFaint }}>This month</span>
      </div>
      <div style={{ fontSize: 25, fontWeight: 800, color: oklch.textStrong, lineHeight: 1.2 }}>{inr(thisMonthMinor / 100)}</div>
      {delta ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 3, fontSize: 12 }}>
          <span style={{ color: deltaColor, fontWeight: 800 }}>
            {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '—'}
          </span>
          <span style={{ color: oklch.textFaint, fontWeight: 500 }}>{delta.text}</span>
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 92, marginTop: 14 }}>
        {months.map((m) => {
          const height = Math.max(4, Math.round((m.totalMinor / max) * 78));
          const isCurrent = m === months[months.length - 1];
          return (
            <div key={m.month} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div
                title={`${monthShort(m.month)}: ${inr(m.totalMinor / 100)}`}
                style={{
                  width: '100%',
                  // A bar is a bar, not a panel: six of them across a laptop-width
                  // card were ~125px wide each and read as blocks. Capped, and
                  // the column centres what is left — on a phone the bars are
                  // ~40px and the cap never applies.
                  maxWidth: 72,
                  height,
                  borderRadius: 6,
                  // The current month is still accruing, so it reads as the
                  // accent while settled months sit back a shade.
                  background: isCurrent ? 'oklch(0.55 0.13 150)' : 'oklch(0.78 0.08 150)',
                }}
              />
              <span style={{ fontSize: 10.5, color: oklch.textFaint, fontWeight: 600 }}>{monthShort(m.month)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type BookingOutcome = 'confirmed' | 'completed' | 'no_show' | 'cancelled';

export interface PlatformBookings {
  thisMonth: number;
  previousMonth: number;
  outcomes: Array<{ status: BookingOutcome; count: number }>;
}

/**
 * Colours mean the same thing they mean everywhere else in the admin plane:
 * green for what happened, blue for what is still to come, amber for the
 * customer who did not turn up, rose for the visit that was called off.
 */
const OUTCOME_STYLE: Record<BookingOutcome, { label: string; color: string }> = {
  confirmed: { label: 'Upcoming', color: 'oklch(0.62 0.12 250)' },
  completed: { label: 'Completed', color: 'oklch(0.6 0.13 150)' },
  no_show: { label: 'No-show', color: 'oklch(0.72 0.13 75)' },
  cancelled: { label: 'Cancelled', color: 'oklch(0.66 0.15 25)' },
};

/**
 * Jira GRW-280 — whether Growza is USED, not only whether it is sold.
 *
 * Every other figure on this dashboard counts businesses or money. A business
 * whose subscription is active and whose payments clear looks perfectly
 * healthy right up to the renewal it does not take; bookings are the leading
 * indicator and revenue the lagging one. So this card sits beside Revenue on
 * purpose — the two read as a pair.
 *
 * Its own card rather than a fifth `StatCard`, which GRW-280's own Technical
 * Notes warned about: five cards in the 4/2/1 grid orphan one on its own row at
 * every width, and the outcome split below needs room a stat card does not
 * have.
 *
 * `confirmed` is labelled "Upcoming". In the schema it means "booked and not
 * yet happened", and "Confirmed" sat next to "Completed" reads as two words for
 * the same thing.
 */
export function BookingsCard({ bookings, className }: { bookings: PlatformBookings; className?: string }) {
  const delta = percentDelta(bookings.thisMonth, bookings.previousMonth);
  const deltaColor =
    delta?.direction === 'up' ? 'oklch(0.5 0.13 150)' : delta?.direction === 'down' ? 'oklch(0.53 0.16 25)' : oklch.textFaint;
  // BR-04 — one call across all four, so the shares total exactly 100.
  const pcts = wholePercentages(bookings.outcomes.map((o) => o.count));

  return (
    <div className={className} style={{ background: oklch.surface, border: `1px solid ${oklch.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Bookings</h3>
        <span style={{ fontSize: 12, color: oklch.textFaint }}>This month · all businesses</span>
      </div>
      <div style={{ fontSize: 25, fontWeight: 800, color: oklch.textStrong, lineHeight: 1.2 }}>{bookings.thisMonth.toLocaleString('en-IN')}</div>
      {/* No movement line when last month had nothing to compare against —
          "↑ 100%" on a first month is noise, not information. */}
      {delta ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 3, fontSize: 12 }}>
          <span style={{ color: deltaColor, fontWeight: 800 }}>{delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '—'}</span>
          <span style={{ color: oklch.textFaint, fontWeight: 500 }}>{delta.text}</span>
        </div>
      ) : null}

      {bookings.thisMonth === 0 ? (
        // A real zero, said as one — not an empty bar that looks like a fault.
        <div style={{ fontSize: 13, color: oklch.textFaint, marginTop: 12 }}>No bookings made yet this month.</div>
      ) : (
        <>
          <div style={{ height: 10, borderRadius: 6, overflow: 'hidden', display: 'flex', background: oklch.divider, margin: '14px 0 10px' }}>
            {bookings.outcomes
              .filter((o) => o.count > 0)
              .map((o) => (
                <div key={o.status} style={{ width: `${(o.count / bookings.thisMonth) * 100}%`, background: OUTCOME_STYLE[o.status].color }} />
              ))}
          </div>
          <div className="admin-outcome-legend">
            {bookings.outcomes.map((o, i) => (
              <div key={o.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '3px 0', minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: OUTCOME_STYLE[o.status].color, flex: 'none' }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: oklch.textStrong }}>{OUTCOME_STYLE[o.status].label}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, flex: 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: oklch.textStrong }}>{o.count.toLocaleString('en-IN')}</span>
                  <span style={{ fontSize: 11, color: oklch.textFaint }}>({pcts[i] ?? 0}%)</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function monthShort(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(iso));
}

export function AttentionRowView({ row, isLast }: { row: AttentionRow; isLast: boolean }) {
  const body = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '12px 0',
        borderBottom: isLast ? 'none' : `1px solid ${oklch.divider}`,
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: row.available ? 'oklch(0.95 0.04 25)' : 'oklch(0.96 0.006 150)',
          color: row.available ? 'oklch(0.5 0.14 25)' : oklch.textFaint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        }}
      >
        <Icon name="alert" size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: row.available ? oklch.textStrong : oklch.textMuted }}>{row.label}</div>
        <div style={{ fontSize: 12.5, color: oklch.textFaint, marginTop: 2 }}>
          {row.available
            ? // A count on its own read as a stray number in the subtitle
              // slot. Say what it means, and — for the zero case — say it is
              // a real zero rather than a row that has nothing behind it,
              // which is the distinction BR-01 turns on.
              //
              // GRW-167 — per row, not one sentence for all of them. "Currently
              // failing" is true of a declined payment and wrong about an
              // invoice that was never raised: nothing failed there, nobody was
              // asked. An admin who reads the wrong noun goes to the wrong
              // screen, and this tile exists because that salon is invisible
              // everywhere else.
              (ATTENTION_SUBTITLES[row.key]?.[row.count === 0 ? 'clear' : 'action'] ??
              (row.count === 0 ? 'Nothing needs attention.' : 'Currently failing — open to reconcile.'))
            : `Not yet available — lands with Jira ${row.epic}.`}
        </div>
      </div>
      {row.available ? (
        <>
          <span style={{ fontSize: 20, fontWeight: 800, color: row.count === 0 ? oklch.textFaint : 'oklch(0.5 0.14 25)' }}>
            {row.count}
          </span>
          <span style={{ color: oklch.textFaint, display: 'flex' }}>
            <Icon name="chevronRight" size={15} />
          </span>
        </>
      ) : null}
    </div>
  );

  // An available row links to the list it counted; an unavailable one has
  // nowhere to go and stays inert rather than looking clickable.
  return row.available && row.href ? (
    <Link href={row.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {body}
    </Link>
  ) : (
    body
  );
}
