'use client';

import { useMemo, useState } from 'react';
import { api, type Appointment, type CustomerStats, type HomeOverview, type HomePeriod } from '../../lib/api';
import { groupBookings } from '../../lib/appointment-display';
import { homeCopy } from '../../lib/home-copy';
import type { Lang } from '../../lib/lang';
import { canSee, type MemberRole } from '../../lib/nav-policy';
import {
  IconAnalytics,
  IconBan,
  IconChat,
  IconChevronDown,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconDaySummary,
  IconOffers,
  IconReports,
  IconServices,
  IconSettings,
  IconStaff,
} from '../icons';
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

  const groups = useMemo(() => {
    // Cancelled visits are counted in Needs attention and listed on Bookings;
    // on Home they would push the day's real work out of a six-row window.
    const list = (p.appointments ?? []).filter((a) => a.status !== 'cancelled' && (!branch || !a.locationId || a.locationId === branch));
    const all = groupBookings(list);
    // Anchor the window on now: one visit already under way, then what is next.
    const firstLive = all.findIndex((g) => new Date(g.endAt).getTime() > now.getTime());
    const from = p.listIsTomorrow || firstLive < 0 ? 0 : Math.max(0, firstLive - 1);
    return { shown: all.slice(from, from + HOME_BOOKINGS_SHOWN), total: all.length };
  }, [p.appointments, p.listIsTomorrow, branch, now]);

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
    { href: '/try-whatsapp', label: t.nav.whatsapp, icon: <IconChat />, tone: 'green', pill: p.whatsappLive ? null : t.nav.demo },
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

      <div className="page-body hm-page">
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

        <div className="hm-owner-grid">
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
                {branches.map((b) => (
                  <li key={b.id} className="hm-row hm-row-button">
                    <button
                      type="button"
                      onClick={() => {
                        setBranch(b.id);
                        load(period, b.id);
                      }}
                    >
                      <span className="hm-branch-tile">{b.name.slice(0, 2).toUpperCase()}</span>
                      <span className="hm-row-main">
                        <span className="hm-row-name">
                          {b.name}
                          {b.isPrimary ? <span className="hm-tag">{t.mainBranch}</span> : null}
                        </span>
                        <span className="hm-row-sub">{t.branchMeta(b.bookingsToday, rupees(b.revenueTodayMinor))}</span>
                      </span>
                      <IconChevronRight />
                    </button>
                  </li>
                ))}
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
            {p.appointments === null ? (
              <CardError t={t} />
            ) : (
              <BookingRows t={t} groups={groups.shown} timezone={p.timezone} now={now} empty={p.listIsTomorrow ? t.nothingTomorrow : t.nothingToday} />
            )}
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
    </>
  );
}

/** "20:00" → "8:00 pm". */
function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
