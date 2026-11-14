'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { formatMoney, formatTime, type CustomerStats } from '../../lib/api';
import { clientNameLabel, initials, summarizeServices, type BookingGroup } from '../../lib/appointment-display';
import type { HomeCopy } from '../../lib/home-copy';
import { NOBODY_INITIAL } from '../../lib/use-no-provider';
import { liveState, minutesBetween, type LiveState } from '../../lib/live-state';
import { AccountMenu } from '../AccountMenu';
import { HeaderBranchPicker } from '../HeaderBranchPicker';
import { MenuButton } from '../MenuButton';
import { NotificationBell } from '../NotificationBell';
import { useLive } from '../SessionProvider';
import { IconChevronRight, IconDaySummary, IconMapPin } from '../icons';
import { HeaderSearch } from '../HeaderSearch';

/**
 * Jira GRW-222 — the pieces all three Homes are built from.
 *
 * One file of small parts rather than a component per file, because none of
 * them is used anywhere but the three Homes, and splitting them twelve ways
 * would make "the status pill looks wrong" a search again.
 */

/**
 * Minor units as rupees, whole. `formatMoney` takes the API's string shape.
 *
 * QA 2026-10-23 — "whole" was the promise and not the code: a day whose bills carried paise drew "₹27,127.37" on the
 * revenue chart beside "₹25K". A Home figure is read at a glance; the paise are on the bill.
 */
export function rupees(minor: number): string {
  return formatMoney(String(Math.round(minor / 100) * 100));
}

/**
 * One order's amount as it is on the bill and on the Orders screen: paise kept, and only when there are some.
 *
 * QA 2026-11-06 — a Recent orders row rounded ₹748.50 to ₹749 while the same order on Orders and the POS read ₹748.50, so
 * an owner matching the row to the order saw two figures. `rupees` stays for every total and card, which are read at a
 * glance (QA 2026-10-23); a row that stands for ONE bill is something people check against that bill.
 */
export function exactRupees(minor: number): string {
  return formatMoney(String(Math.round(minor)));
}

/**
 * A stable tint per person, from their id — never a fixed map of names.
 * The design's colours were per mock person; a real salon's roster is not.
 *
 * Jira GRW-351 — every initial is 4.5:1 or better on its tint (WCAG 1.4.3; the
 * initials are 12–13px). Amber was #b76e12 (3.64:1) and blue #2563eb (4.48:1).
 */
const TINTS = [
  { bg: 'var(--accent-soft)', fg: 'var(--accent-deep)' },
  { bg: 'var(--blue-soft)', fg: 'var(--blue)' },
  { bg: 'var(--amber-soft)', fg: 'var(--amber-ink)' },
  { bg: 'var(--purple-soft)', fg: 'var(--purple-deep)' },
  { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
];
export function tintFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

/**
 * `nobody` — Jira GRW-363: a row that is not a person (the no-stylist row) gets a neutral dash, not
 * initials made from its phrase ("NS", "कस") in a colour that makes it look like someone.
 */
export function Avatar({
  name,
  id,
  size = 38,
  nobody = false,
  photoUrl,
}: {
  name: string | null;
  id: string;
  size?: number;
  nobody?: boolean;
  photoUrl?: string | null;
}) {
  const [broken, setBroken] = useState(false);
  const t = nobody ? { bg: 'var(--border)', fg: 'var(--muted)' } : tintFor(id);
  if (!nobody && photoUrl && !broken) {
    return (
      <img
        className="hm-avatar person-photo"
        src={photoUrl}
        alt=""
        style={{ width: size, height: size, objectFit: 'cover' }}
        onError={() => setBroken(true)}
        aria-hidden
      />
    );
  }
  return (
    <span className="hm-avatar" style={{ width: size, height: size, background: t.bg, color: t.fg }} aria-hidden>
      {nobody ? NOBODY_INITIAL : initials(name)}
    </span>
  );
}

/**
 * The Home header. On a phone: the menu button, the business name in full over
 * the date (and the branch, when the owner has no branch picker to say it), then
 * search and the avatar — the same controls every other screen has. On a laptop:
 * the greeting over one line of context, search, and the rest.
 *
 * Jira GRW-306 — the phone header used to carry five things (hamburger, name,
 * language, day summary, avatar) and cut the name to "Velvet Sciss…". Language
 * moved into the avatar's menu (a setting changed once, not a control worth a
 * permanent slot), Day summary onto the row under the header, and the period
 * switch into the money card. The greeting stays an `h1` for screen readers; it
 * is only hidden from sight on a phone.
 */
export function HomeHeader({
  t,
  title,
  sub,
  businessName,
  locationName,
  dateLabel,
  onDaySummary,
  simpleDesktop = false,
}: {
  t: HomeCopy;
  title: string;
  sub: string;
  businessName: string;
  locationName: string | null;
  dateLabel: string;
  /** Owner only — the Day summary is the business's takings. */
  onDaySummary?: () => void;
  /** Simple restaurant desktop header: calendar date pill + bell + avatar. */
  simpleDesktop?: boolean;
}) {
  // Jira GRW-556 — no bookings feed until the business is live.
  const live = useLive();
  return (
    <header className={`hm-head${simpleDesktop ? ' is-rst-head' : ''}`}>
      <MenuButton />
      <div className="hm-head-id">
        <div className="hm-head-business">{businessName}</div>
        {/* The design's phone header: "MG Road · Thu, 11 Sep". */}
        <div className="hm-head-branch">
          {locationName ? <IconMapPin /> : null}
          {/* Two spans (Jira GRW-253 QA): on a narrow phone a long branch name no longer
              pushes the date out entirely — each keeps part of the line. */}
          {locationName ? <span className="hm-head-branch-name">{locationName}</span> : null}
          {/* Jira GRW-395 — an owner with branches picks one here on a phone ("📍 MG Road ▾ · Fri, 25 Sep"). */}
          {locationName ? null : <HeaderBranchPicker variant="line" />}
          <span className="hm-head-branch-date">{locationName ? `· ${dateLabel}` : dateLabel}</span>
        </div>
        <h1 className="hm-head-title">{title}</h1>
        <div className="hm-head-sub">{sub}</div>
      </div>
      <div className="hm-head-controls">
        {/* Jira GRW-395 — the one branch picker; Home's own dropdown and tabs are gone. */}
        <HeaderBranchPicker />
        {/* Jira GRW-409 — the same gated search as every other header; a receptionist's or stylist's Home has none. */}
        {/* Emerald v2 — the restaurant's laptop header carries the search too, as a pill (it was phone-only). */}
        <HeaderSearch wide />
        {onDaySummary && !simpleDesktop ? (
          <button type="button" className="hm-summary-btn" onClick={onDaySummary} aria-label={t.daySummary}>
            <IconDaySummary />
            <span>{t.daySummary}</span>
          </button>
        ) : null}
        {/*
          Emerald v3 (owner, 2026-11-14, "remove it") — the laptop header's date pill is gone: it looked like a date
          picker and opened Day summary. The date is in the page head's line now, and Day summary has its own button.
        */}
        {simpleDesktop ? null : <span className="hm-date-chip hm-desktop">{dateLabel}</span>}
        {live ? <NotificationBell /> : null}
        <AccountMenu />
      </div>
    </header>
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    // Jira GRW-679 (UX-02) — `hm-card-acts` marks a card whose head carries a link, so a phone can draw that link as
    // the card's foot (see 83-role-home.css). The markup and its reading order do not change.
    <section className={`hm-card ${action ? 'hm-card-acts ' : ''}${className}`}>
      {title || action ? (
        <div className="hm-card-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** BR-12 — a read that failed says so, and never renders as zero. */
export function CardError({ t, onRetry }: { t: HomeCopy; onRetry?: () => void }) {
  return (
    <div className="hm-error" role="alert">
      <span>{t.couldNotLoad}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          {t.retry}
        </button>
      ) : null}
    </div>
  );
}

/** Tabs from 861px up; on a phone the same choice is a dropdown (CSS swaps them at 860px), so the toolbar row
 *  keeps its room for the branch picker and the Day summary icon. One `value`, one `onChange` — both controls
 *  read and write the same state. */
export function Segmented<T extends string>({ value, options, onChange, label, className = '' }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <>
      <div className={`hm-seg ${className}`} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <select className="hm-seg-select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

export type AttentionTone = 'amber' | 'rose' | 'blue' | 'violet';

export function AttentionList({ items }: { items: Array<{ key: string; count: number; label: string; sub?: string; tone: AttentionTone; href: string; icon: ReactNode }> }) {
  return (
    <div className="hm-attention">
      {items.map((a) => (
        <a key={a.key} className={`hm-att hm-tone-${a.tone}${a.count === 0 ? ' is-clear' : ''}`} href={a.href}>
          <span className="hm-att-icon">{a.icon}</span>
          <span className="hm-att-text">
            <span className="hm-att-line">
              <strong>{a.count}</strong> {a.label}
            </span>
            {a.sub ? <span className="hm-att-sub">{a.sub}</span> : null}
          </span>
          <IconChevronRight />
        </a>
      ))}
    </div>
  );
}

export function QuickTiles({ items }: { items: Array<{ href?: string; onClick?: () => void; label: string; icon: ReactNode; tone: string; pill?: string | null }> }) {
  return (
    <div className="hm-tiles">
      {items.map((q) => {
        const inner = (
          <>
            <span className={`hm-tile-icon hm-tile-${q.tone}`}>{q.icon}</span>
            <span className="hm-tile-label">
              {q.label}
              {q.pill ? <span className="hm-tile-pill">{q.pill}</span> : null}
            </span>
          </>
        );
        return q.href ? (
          <a key={q.label} className="hm-tile" href={q.href}>
            {inner}
          </a>
        ) : (
          <button key={q.label} type="button" className="hm-tile" onClick={q.onClick}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

const SEGMENT_KEYS = ['active', 'due', 'at_risk', 'inactive'] as const;

/** How your clients are doing — the same bands and counts the Clients screen shows. */
export function SegmentCards({
  t,
  stats,
  branch,
}: {
  t: HomeCopy;
  stats: CustomerStats | null;
  /**
   * Jira GRW-392 (review) — the branch these figures are for (null: every branch). The Clients screen a card opens
   * is told the same branch, so the card and the list agree; unnamed, it would open on the remembered one.
   */
  branch?: string | null;
}) {
  if (!stats) return <CardError t={t} />;
  // Counts AND shares straight from `/customers/stats`, so this card and the
  // Clients screen's bands cannot round the same numbers two different ways.
  const bands = new Map(stats.segments.map((s) => [s.key, s]));
  const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));
  return (
    <>
      {stats.neverVisited > 0 ? <p className="hm-card-hint">{t.clientsDoingHint} · {t.neverVisited(stats.neverVisited, pct(stats.neverVisited, stats.total))}</p> : <p className="hm-card-hint">{t.clientsDoingHint}</p>}
      <div className="hm-segments">
        {SEGMENT_KEYS.map((key) => {
          const n = bands.get(key)?.count ?? 0;
          const share = bands.get(key)?.pct ?? 0;
          const seg = t.segments[key];
          return (
            <a
              key={key}
              className={`hm-seg-card hm-seg-${key}`}
              href={`/customers?status=${key}&branch=${encodeURIComponent(branch ?? 'all')}`}
              style={{ '--seg-pct': `${share}%` } as CSSProperties}
            >
              <span className="hm-seg-top">
                <span className="hm-seg-name">
                  <i />
                  {seg.label}
                </span>
                <span className="hm-seg-range">{seg.range}</span>
              </span>
              <span className="hm-seg-count">
                <strong>{n}</strong>
                <span>{share}%</span>
              </span>
            </a>
          );
        })}
      </div>
    </>
  );
}

const PILL_TONE: Record<LiveState, string> = {
  done: 'green',
  in_service: 'blue',
  later: 'grey',
  needs_answer: 'amber',
  cancelled: 'rose',
  no_show: 'rose',
};

export function StatusPill({ t, group, now }: { t: HomeCopy; group: BookingGroup; now: Date }) {
  const state = liveState(group, now);
  const label =
    state === 'done'
      ? t.status.completed
      : state === 'in_service'
        ? t.status.inService
        : state === 'later'
          ? t.status.later
          : state === 'needs_answer'
            ? t.status.needsAnswer
            : state === 'cancelled'
              ? t.status.cancelled
              : t.status.noShow;
  return <span className={`hm-pill hm-pill-${PILL_TONE[state]}`}>{label}</span>;
}

/**
 * Jira GRW-225 — one client, one avatar colour, however many visits they have
 * today. Keyed by the booking only when the salon withholds who the client is
 * (GRW-166: `customerName` absent), so a matching colour cannot say it either.
 */
export function avatarKey(g: BookingGroup): string {
  // A client's phone is their identity here (GRW-189); the name is the fallback for a walk-in with none.
  return g.customerName !== undefined ? (g.customerPhone ?? g.customerName ?? g.key) : g.key;
}

/**
 * The compact list rows every Home uses: time, who, what, where it stands.
 *
 * With `onOpen` the whole row is one button (owner, 2026-10-13: "these are not clickable?"). It is the same
 * booking the Bookings screen shows, so tapping it opens the same summary rather than teaching a second way to
 * read a visit; the markup is `GiveToStaffSheet`'s `.hm-row-button` exactly, so a row that can be tapped is a
 * real button — reachable from a keyboard, and 56px of target either way.
 */
export function BookingRows({
  t,
  groups,
  timezone,
  now,
  empty,
  showStaff = true,
  onOpen,
}: {
  t: HomeCopy;
  groups: BookingGroup[];
  timezone: string;
  now: Date;
  empty: string;
  showStaff?: boolean;
  onOpen?: (group: BookingGroup) => void;
}) {
  if (groups.length === 0) return <p className="hm-empty">{empty}</p>;
  return (
    <ul className="hm-rows">
      {groups.map((g) => {
        const name = clientNameLabel(g);
        const services = summarizeServices(g.serviceNames, t.lang);
        const inside = (
          <>
            <span className="hm-row-time">{formatTime(g.startAt, timezone)}</span>
            <Avatar name={name} id={avatarKey(g)} size={34} />
            <span className="hm-row-main">
              <span className="hm-row-name">{name ?? services}</span>
              <span className="hm-row-sub">{showStaff && g.providerNames.length ? `${services} · ${g.providerNames.join(', ')}` : services}</span>
            </span>
            <StatusPill t={t} group={g} now={now} />
          </>
        );
        return onOpen ? (
          <li key={g.key} className="hm-row hm-row-button">
            <button type="button" onClick={() => onOpen(g)}>
              {inside}
            </button>
          </li>
        ) : (
          <li key={g.key} className="hm-row">
            {inside}
          </li>
        );
      })}
    </ul>
  );
}

export { minutesBetween };

/* =====================================================================================================
 * Emerald v3 — the laptop Home's chart row, shared by every vertical's Home (owner, 2026-11-14: "apply the
 * same layout to all verticals"). Each takes figures already read; none fetches, and each draws nothing
 * when there is nothing to draw.
 * ===================================================================================================== */

/** One column of the week chart. `amount` null: no figure above the bar (an empty or future day). */
export type WeekBar = { key: string; label: string; pct: number; amount: string | null; peak: boolean; srText: string };

/** Pill bars over a striped track, each day's amount on top, the best day in the dark green. */
export function WeekBarsCard({ title, total, bars }: { title: string; total: string | null; bars: WeekBar[] }) {
  return (
    <section className="rst-panel rst-week-panel">
      <div className="rst-panel-head">
        <h3>{title}</h3>
        {total ? <strong className="rst-week-total">{total}</strong> : null}
      </div>
      <ul className="rst-week-bars">
        {bars.map((b) => (
          <li key={b.key} className={b.peak ? 'is-peak' : ''}>
            <span className="rst-week-amt" aria-hidden="true">
              {b.amount ?? ''}
            </span>
            <span className="rst-week-slot">
              <span className="rst-week-bar" style={{ height: `${b.pct}%` }} />
            </span>
            <span className="rst-week-day">{b.label}</span>
            <span className="sr-only">{b.srText}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A way of paying and its share of 100, biggest first; `start` is where its arc begins on the half-donut. */
export type PaySlice = { mode: string; minor: number; pct: number; start: number };

/** Splits takings by how they were paid into shares that add to exactly 100 (the last share takes the rounding). */
export function paySlicesOf(byMode: ReadonlyArray<{ mode: string; revenueMinor: number }> | undefined): PaySlice[] {
  const raw = (byMode ?? []).filter((m) => m.revenueMinor > 0).sort((a, b) => b.revenueMinor - a.revenueMinor);
  const total = raw.reduce((sum, m) => sum + m.revenueMinor, 0);
  let start = 0;
  return raw.map((m, i) => {
    const pct = i === raw.length - 1 ? 100 - start : Math.round((m.revenueMinor / total) * 100);
    const slice = { mode: m.mode, minor: m.revenueMinor, pct, start };
    start += pct;
    return slice;
  });
}

/** The half-donut: the biggest way of paying in the dark green and its share in the middle, a legend under it. */
export function PayGaugeCard({
  title,
  slices,
  nameOf,
  money,
}: {
  title: string;
  slices: PaySlice[];
  nameOf: (mode: string) => string;
  money: (minor: number) => string;
}) {
  const top = slices[0];
  if (!top) return null;
  return (
    <section className="rst-panel rst-pay-panel">
      <div className="rst-panel-head">
        <h3>{title}</h3>
      </div>
      <div className="rst-gauge">
        <svg viewBox="0 0 120 66" aria-hidden="true" focusable="false">
          <path className="rst-gauge-track" d="M10 60 A50 50 0 0 1 110 60" pathLength={100} />
          {slices.map((sl, i) => (
            <path
              key={sl.mode}
              className={`rst-gauge-arc is-${i}`}
              d="M10 60 A50 50 0 0 1 110 60"
              pathLength={100}
              strokeDasharray={`${Math.max(0, sl.pct - 1.2)} 100`}
              strokeDashoffset={-sl.start}
            />
          ))}
        </svg>
        <div className="rst-gauge-mid">
          <strong>{top.pct}%</strong>
          <span>{nameOf(top.mode)}</span>
        </div>
      </div>
      <ul className="rst-gauge-legend">
        {slices.map((sl, i) => (
          <li key={sl.mode}>
            <i className={`is-${i}`} aria-hidden="true" />
            <span>{nameOf(sl.mode)}</span>
            <b>{money(sl.minor)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The dark card: one live number, a line under it, and the door to it. */
export function DarkStatCard({
  title,
  value,
  valueLabel,
  foot,
  action,
}: {
  title: string;
  value: ReactNode;
  valueLabel: string;
  foot?: ReactNode;
  action?: { href: string; label: string } | null;
}) {
  return (
    <section className="rst-queue-card">
      <div className="rst-queue-head">
        <h3>{title}</h3>
      </div>
      <p className="rst-queue-count">
        <strong>{value}</strong>
        <span>{valueLabel}</span>
      </p>
      {foot ? <p className="rst-queue-done">{foot}</p> : null}
      {action ? (
        <a className="rst-queue-btn" href={action.href}>
          {action.label}
        </a>
      ) : null}
    </section>
  );
}

/** The page head: the greeting and one line on the left (hidden from a screen reader, which has the header's h1), actions right. */
export function PageHead({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="rst-page-head">
      <div className="rst-page-id" aria-hidden="true">
        <p className="rst-page-title">{title}</p>
        <p className="rst-page-sub">{sub}</p>
      </div>
      <div className="rst-page-actions">{children}</div>
    </div>
  );
}
