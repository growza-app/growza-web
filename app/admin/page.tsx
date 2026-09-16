'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, AdminApiError } from './lib/api';
import { firstPermittedHref } from './nav';
import { Icon, type IconName } from './icons';
import { Card, EmptyState, SecondaryButton } from './components/primitives';
import {
  StatCard,
  AttentionRowView,
  RevenueCard,
  wholePercentages,
  type RevenueMonth,
  ACTION_TINTS,
  countDelta,
  initials,
  percentDelta,
  tintFor,
  type AttentionRow,
  type StatTint,
  type StatIcon,
} from './components/DashboardParts';
import { oklch, STATUS_COLORS } from './tokens';

/**
 * GRW-104's platform dashboard. GRW-020 — "Two Home labels that were not
 * true" — already paid for the mistake this story exists to prevent: a
 * dashboard figure is a claim a platform admin acts on, and most of what a
 * dashboard like this one eventually shows (MRR, payment failures,
 * near-limit counts) belongs to epics that have not shipped. So this screen
 * only renders figures with a real query behind them — total businesses,
 * the status breakdown, new businesses this period, an honest attention
 * panel (every row present, every unbuilt one naming the Jira epic that
 * fills it in rather than a fabricated zero, BR-01/BR-02), and, since
 * GRW-265, real navigation (Quick actions) and a real recent-signups list.
 * GRW-265's own mobile-redesign pass deliberately left out everything else a
 * design import proposed (Revenue, platform health, usage metering, support
 * tickets) because none of it has a data source yet — see that story's
 * ticket record for where each piece belongs once it does.
 */

interface StatusCount {
  status: string;
  count: number;
}

interface RecentSignup {
  tenantId: string;
  name: string;
  vertical: string;
  createdAt: string;
}

interface DashboardResponse {
  totalBusinesses: number;
  totalAtPeriodStart: number;
  byStatus: StatusCount[];
  newBusinesses: { count: number; previous: number; period: { from: string; to: string } };
  attention: AttentionRow[];
  recentSignups: RecentSignup[];
  revenue: { currency: string; thisMonthMinor: number; previousMonthMinor: number; months: RevenueMonth[] } | null;
}

/** GRW-275 — the reference design's four card tints, one per card. */
const STAT_TINTS = {
  green: { bg: 'oklch(0.965 0.025 155)', fg: 'oklch(0.45 0.12 150)', border: 'oklch(0.92 0.04 155)' },
  blue: { bg: 'oklch(0.96 0.025 250)', fg: 'oklch(0.5 0.15 250)', border: 'oklch(0.92 0.035 250)' },
  amber: { bg: 'oklch(0.965 0.035 75)', fg: 'oklch(0.55 0.13 65)', border: 'oklch(0.93 0.05 75)' },
  rose: { bg: 'oklch(0.965 0.025 25)', fg: 'oklch(0.53 0.16 25)', border: 'oklch(0.93 0.035 25)' },
} satisfies Record<string, StatTint>;

const STATUS_LABEL: Record<string, string> = { provisioning: 'Provisioning', active: 'Active', suspended: 'Suspended', churned: 'Churned' };

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/**
 * GRW-275 — which attention rows earn a headline card.
 *
 * Only rows the registry already marks `available` render here (the guard is
 * in the JSX): an unbuilt row stays in the Billing attention list below,
 * where it can say so honestly, rather than becoming a card showing a zero
 * that means "not built" — the exact BR-01 confusion this dashboard exists
 * to avoid.
 */
const ATTENTION_CARDS: Array<{
  key: string;
  label: string;
  icon: StatIcon;
  tint: StatTint;
  /** Fills the movement row these cards have no movement for — and carries the period the short label drops. */
  note: (count: number) => string;
}> = [
  {
    key: 'payments_failed',
    label: 'Payments failed',
    icon: 'alert',
    tint: STAT_TINTS.amber,
    note: (count) => (count > 0 ? 'Open to reconcile' : 'Nothing failing'),
  },
  {
    key: 'cancellations',
    label: 'Cancellations',
    icon: 'money',
    tint: STAT_TINTS.rose,
    // The label is shortened to fit one line at phone width, so "this month"
    // — which is genuinely part of what this number means — moves here rather
    // than being lost.
    note: () => 'This month',
  },
];

const QUICK_ACTIONS: Array<{ icon: IconName; label: string; href: string; tint: keyof typeof ACTION_TINTS }> = [
  { icon: 'businesses', label: 'Add business', href: '/admin/businesses', tint: 'businesses' },
  { icon: 'users', label: 'Invite admin', href: '/admin/users', tint: 'users' },
  { icon: 'plans', label: 'Create plan', href: '/admin/plans/new', tint: 'plans' },
  { icon: 'usage', label: 'View usage', href: '/admin/usage', tint: 'usage' },
  { icon: 'audit', label: 'Audit log', href: '/admin/audit-logs', tint: 'audit' },
];

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  /**
   * GRW-171 — where somebody goes who cannot see this page.
   *
   * Sign-in lands everyone on `/admin`, and the Dashboard needs
   * `admin.dashboard.view`. A Support administrator without it used to get a
   * permission error offering a Retry that could never succeed. A 403 here is
   * not a failure to recover from, it is a signpost: send them to the first
   * screen their permissions actually open.
   */
  const router = useRouter();
  const [noWayIn, setNoWayIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNoWayIn(false);
    adminFetch<DashboardResponse>('/dashboard')
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(async (err) => {
        if (cancelled) return;
        if (err instanceof AdminApiError && err.status === 403) {
          try {
            const me = await adminFetch<{ permissions: string[] }>('/me');
            const href = firstPermittedHref(me.permissions);
            if (cancelled) return;
            if (href && href !== '/admin') {
              router.replace(href);
              return;
            }
            // Their role opens nothing. Saying so is the only honest answer,
            // and it is an administrator problem rather than a page problem.
            setNoWayIn(true);
            return;
          } catch {
            // /me is unreachable too — fall through to the ordinary error.
          }
        }
        if (!cancelled) setError(err instanceof AdminApiError ? err.message : 'Could not load the dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken, router]);

  if (noWayIn) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 6 }}>
            Your role does not open any screens yet
          </div>
          <div style={{ fontSize: 13, color: oklch.textMuted }}>
            Ask a Super Admin to add permissions to it. Retrying will not change this.
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
          <SecondaryButton onClick={() => setRetryToken((n) => n + 1)}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="admin-stat-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i}>
              <div
                style={{ height: 74, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }}
              />
            </Card>
          ))}
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <div
              style={{ height: 120, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }}
            />
          </Card>
        ))}
      </div>
    );
  }

  const empty = data.totalBusinesses === 0;
  // Computed across the whole breakdown at once, so the four shares total 100
  // rather than each rounding independently — see `wholePercentages`.
  const statusPercentages = wholePercentages(data.byStatus.map((s) => s.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* FR-01/AC-01 — every figure here has a real query behind it: Total and
          New this month are their own dedicated reads; Active and
          Provisioning are the same `byStatus` array the status bar below
          reads, just pulled out as headline cards — no new query, and the
          same `STATUS_COLORS` tint as their dot in that bar, so a card and
          its own legend row can't disagree about what color means what.
          A fixed 2-column grid, not auto-fit/minmax: at a 360px-wide phone (the device matrix's "common Android" entry) minus
          this shell's 24px side padding, minmax(min(150px, 100%),1fr) needed 314px for 2 tracks and had 312 — it silently collapsed to
          one giant card per row instead of the intended 2-up. A fixed template can't fall through that threshold. */}
      <div className="admin-stat-grid">
        <StatCard
          icon="businesses"
          label="Total businesses"
          value={data.totalBusinesses}
          href="/admin/businesses"
          tint={STAT_TINTS.green}
          delta={percentDelta(data.totalBusinesses, data.totalAtPeriodStart)}
        />
        <StatCard
          icon="trend"
          label="New this month"
          value={data.newBusinesses.count}
          href={`/admin/businesses?createdFrom=${encodeURIComponent(data.newBusinesses.period.from)}`}
          tint={STAT_TINTS.blue}
          delta={countDelta(data.newBusinesses.count, data.newBusinesses.previous)}
        />
        {/* The reference's bottom two cards are attention-flavoured (warm tint,
            chevron). These are the two attention rows that already have a real
            query and a real place to go — no invented grace-period or past-due
            count, which is what that mockup used the slots for. */}
        {ATTENTION_CARDS.map(({ key, label, tint, icon, note }) => {
          const row = data.attention.find((r) => r.key === key);
          if (!row?.available || row.href === undefined) return null;
          return (
            <StatCard
              key={key}
              icon={icon}
              label={label}
              value={row.count ?? 0}
              href={row.href}
              tint={tint}
              note={note(row.count ?? 0)}
              chevron
            />
          );
        })}
      </div>

      {/* GRW-277 QA — one column on a phone, two on a laptop. The DOM order
          below IS the phone order (quick actions, revenue, status, attention,
          signups); `admin.css`'s grid areas rearrange it above 1000px. */}
      <div className="admin-dash-cols">
        {/* GRW-265/274 FR-01 — real links to screens that already exist and are already permission-gated. */}
        <Card className="admin-dash-quick">
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Quick actions</h3>
          {/* Fixed 5-column grid, not auto-fit/minmax — same reasoning as the KPI
            grid above. Icon-above-label, centered, no border: matches the
            tenant Home's own compact tile pattern (`hm-tile`,
            83-role-home.css) rather than this admin plane's own bordered-row
            style used elsewhere, on purpose — 5 short labels read better
            stacked than they did squeezed into a 2-up bordered row. */}
          <div className="admin-quick-grid">
            {QUICK_ACTIONS.map((action) => {
              const tint = ACTION_TINTS[action.tint];
              return (
                // The reference tints the whole tile, not just an icon badge —
                // the tile IS the coloured surface, icon plain on top of it.
                <Link
                  key={action.href}
                  href={action.href}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: 7,
                    padding: '12px 4px 10px',
                    borderRadius: 14,
                    background: tint.bg,
                    textDecoration: 'none',
                    color: oklch.textStrong,
                    minWidth: 0,
                  }}
                >
                  <span style={{ color: tint.fg, display: 'flex', flex: 'none' }}>
                    <Icon name={action.icon} size={21} />
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.25, textAlign: 'center' }}>{action.label}</span>
                </Link>
              );
            })}
          </div>
        </Card>

        {/* GRW-276 — collected revenue, from settled `payment` rows. Absent
          entirely (not zeroed) for an admin without `admin.payment.view`:
          platform takings are not every role's business. */}
        {data.revenue ? (
          <RevenueCard
            className="admin-dash-revenue"
            months={data.revenue.months}
            thisMonthMinor={data.revenue.thisMonthMinor}
            delta={percentDelta(data.revenue.thisMonthMinor, data.revenue.previousMonthMinor)}
          />
        ) : null}

        {/* GRW-274 — a segmented bar + legend reading the exact same `byStatus`
          array the old plain list did; no new query, no fabricated trend. */}
        <Card className="admin-dash-status">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted }}>Business status</div>
            <div style={{ fontSize: 12, color: oklch.textFaint }}>
              Total <strong style={{ color: oklch.textStrong, fontWeight: 800 }}>{data.totalBusinesses}</strong>
            </div>
          </div>
          {empty ? (
            <div style={{ fontSize: 13, color: oklch.textFaint }}>No businesses on the platform yet.</div>
          ) : (
            <>
              <div
                style={{ height: 10, borderRadius: 6, overflow: 'hidden', display: 'flex', background: oklch.divider, marginBottom: 12 }}
              >
                {data.byStatus
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <div
                      key={s.status}
                      style={{
                        width: `${(s.count / data.totalBusinesses) * 100}%`,
                        background: STATUS_COLORS[STATUS_LABEL[s.status] ?? '']?.[0] ?? oklch.textFaint,
                      }}
                    />
                  ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {data.byStatus.map((s, i) => {
                  const pct = statusPercentages[i] ?? 0;
                  const dotColor = STATUS_COLORS[STATUS_LABEL[s.status] ?? '']?.[0] ?? oklch.textFaint;
                  return (
                    <Link
                      key={s.status}
                      href={`/admin/businesses?status=${s.status}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textDecoration: 'none',
                        padding: '5px 0',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flex: 'none' }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: oklch.textStrong }}>{STATUS_LABEL[s.status] ?? s.status}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: oklch.textStrong }}>{s.count}</span>
                        <span style={{ fontSize: 11.5, color: oklch.textFaint }}>({pct}%)</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* FR-02/AC-02 — every row present whether or not its epic has shipped; a row without a real count yet names it. */}
        <Card className="admin-dash-attention">
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Billing attention</h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.attention.map((row, i) => (
              <AttentionRowView key={row.key} row={row} isLast={i === data.attention.length - 1} />
            ))}
          </div>
        </Card>

        {/* GRW-265/274 FR-02 — real signups, `tenant.created_at`, the same
          column the KPI above already counts. "View all" is real: `/admin/
          businesses` lists every business this list is a preview of. */}
        <Card className="admin-dash-signups">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Recent signups</h3>
            <Link href="/admin/businesses" style={{ fontSize: 12.5, fontWeight: 700, color: oklch.accent, textDecoration: 'none' }}>
              View all
            </Link>
          </div>
          {data.recentSignups.length === 0 ? (
            <EmptyState title="No signups yet" sub="New businesses will appear here as they join." icon="businesses" />
          ) : (
            // The reference lays each signup out as avatar + (name over date)
            // side by side, scrolling sideways, with a round "more" control at
            // the end — that control goes to the same real list "View all" does.
            // `minWidth: 0` is what makes the sideways scroll actually scroll.
            // Without it this flex row's automatic minimum size is its content,
            // so at 320px it widened the card, the card widened the page, and
            // the whole document scrolled sideways instead of just this strip.
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, overflowX: 'auto', minWidth: 0, paddingBottom: 2 }}>
              {data.recentSignups.map((signup) => {
                const tint = tintFor(signup.tenantId);
                return (
                  <Link
                    key={signup.tenantId}
                    href={`/admin/businesses/${signup.tenantId}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit', flex: '0 0 auto' }}
                  >
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: tint.bg,
                        color: tint.fg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 13.5,
                        flex: 'none',
                      }}
                    >
                      {initials(signup.name)}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textStrong, whiteSpace: 'nowrap' }}>{signup.name}</span>
                      <span style={{ fontSize: 11, color: oklch.textFaint, whiteSpace: 'nowrap' }}>{shortDate(signup.createdAt)}</span>
                    </span>
                  </Link>
                );
              })}
              <Link
                href="/admin/businesses"
                aria-label="All businesses"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: `1px solid ${oklch.border}`,
                  background: oklch.surface,
                  color: oklch.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                <Icon name="chevronRight" size={16} />
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
