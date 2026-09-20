'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatMoney, formatTime, type CustomerStats } from '../../lib/api';
import { clientNameLabel, initials, summarizeServices, type BookingGroup } from '../../lib/appointment-display';
import type { HomeCopy } from '../../lib/home-copy';
import { liveState, minutesBetween, type LiveState } from '../../lib/live-state';
import { AccountMenu } from '../AccountMenu';
import { MenuButton } from '../MenuButton';
import { NotificationBell } from '../NotificationBell';
import { IconChevronRight, IconDaySummary, IconMapPin, IconSearch } from '../icons';

/**
 * Jira GRW-222 — the pieces all three Homes are built from.
 *
 * One file of small parts rather than a component per file, because none of
 * them is used anywhere but the three Homes, and splitting them twelve ways
 * would make "the status pill looks wrong" a search again.
 */

/** Minor units as rupees, whole. `formatMoney` takes the API's string shape. */
export function rupees(minor: number): string {
  return formatMoney(String(minor));
}

/**
 * A stable tint per person, from their id — never a fixed map of names.
 * The design's colours were per mock person; a real salon's roster is not.
 */
const TINTS = [
  { bg: '#e7f6ee', fg: '#16794a' },
  { bg: '#e8effd', fg: '#2563eb' },
  { bg: '#fdf3e3', fg: '#b76e12' },
  { bg: '#efebfb', fg: '#6d4fc4' },
  { bg: '#fdeceb', fg: '#c53b3b' },
];
export function tintFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

export function Avatar({ name, id, size = 38 }: { name: string | null; id: string; size?: number }) {
  const t = tintFor(id);
  return (
    <span className="hm-avatar" style={{ width: size, height: size, background: t.bg, color: t.fg }} aria-hidden>
      {initials(name)}
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
}: {
  t: HomeCopy;
  title: string;
  sub: string;
  businessName: string;
  locationName: string | null;
  dateLabel: string;
  /** Owner only — the Day summary is the business's takings. */
  onDaySummary?: () => void;
}) {
  const s = useTranslations('search');
  return (
    <header className="hm-head">
      <MenuButton />
      <div className="hm-head-id">
        <div className="hm-head-business">{businessName}</div>
        {/* The design's phone header: "MG Road · Thu, 11 Sep". */}
        <div className="hm-head-branch">
          {locationName ? <IconMapPin /> : null}
          {/* Two spans (Jira GRW-253 QA): on a narrow phone a long branch name no longer
              pushes the date out entirely — each keeps part of the line. */}
          {locationName ? <span className="hm-head-branch-name">{locationName}</span> : null}
          <span className="hm-head-branch-date">{locationName ? `· ${dateLabel}` : dateLabel}</span>
        </div>
        <h1 className="hm-head-title">{title}</h1>
        <div className="hm-head-sub">{sub}</div>
      </div>
      <div className="hm-head-controls">
        <a className="hdr-search hdr-search-wide" href="/search" aria-label={s('title')}>
          <IconSearch />
          <span>{s('prompt')}</span>
        </a>
        {onDaySummary ? (
          <button type="button" className="hm-summary-btn" onClick={onDaySummary} aria-label={t.daySummary}>
            <IconDaySummary />
            <span>{t.daySummary}</span>
          </button>
        ) : null}
        <span className="hm-date-chip hm-desktop">{dateLabel}</span>
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`hm-card ${className}`}>
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
        <a key={a.key} className={`hm-att hm-tone-${a.tone}`} href={a.href}>
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
export function SegmentCards({ t, stats }: { t: HomeCopy; stats: CustomerStats | null }) {
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
          const seg = t.segments[key];
          return (
            <a key={key} className={`hm-seg-card hm-seg-${key}`} href={`/customers?status=${key}`}>
              <span className="hm-seg-top">
                <span className="hm-seg-name">
                  <i />
                  {seg.label}
                </span>
                <span className="hm-seg-range">{seg.range}</span>
              </span>
              <span className="hm-seg-count">
                <strong>{n}</strong>
                <span>{bands.get(key)?.pct ?? 0}%</span>
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

/** The compact list rows every Home uses: time, who, what, where it stands. */
export function BookingRows({ t, groups, timezone, now, empty, showStaff = true }: { t: HomeCopy; groups: BookingGroup[]; timezone: string; now: Date; empty: string; showStaff?: boolean }) {
  if (groups.length === 0) return <p className="hm-empty">{empty}</p>;
  return (
    <ul className="hm-rows">
      {groups.map((g) => {
        const name = clientNameLabel(g);
        const services = summarizeServices(g.serviceNames);
        return (
          <li key={g.key} className="hm-row">
            <span className="hm-row-time">{formatTime(g.startAt, timezone)}</span>
            <Avatar name={name} id={avatarKey(g)} size={34} />
            <span className="hm-row-main">
              <span className="hm-row-name">{name ?? services}</span>
              <span className="hm-row-sub">{showStaff && g.providerNames.length ? `${services} · ${g.providerNames.join(', ')}` : services}</span>
            </span>
            <StatusPill t={t} group={g} now={now} />
          </li>
        );
      })}
    </ul>
  );
}

export { minutesBetween };
