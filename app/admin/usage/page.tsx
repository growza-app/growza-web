'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly } from '../lib/format';
import { Card, EmptyState, SecondaryButton, SectionTitle, StatusPill, Table, TableRow, type TableColumn } from '../components/primitives';
import { Pagination, DEFAULT_PAGE_SIZE, type PaginationState } from '../components/Pagination';
import { useAdminSearch } from '../components/SearchContext';
import { subscriptionStatusLabel } from '../lib/subscription-status';
import { oklch, usageState } from '../tokens';

/**
 * GRW-126's Usage screen — the last story in epic Jira GRW-85, and the first
 * time anything in the product shows what the meter actually counted.
 *
 * This screen used to render `getBusinesses()` behind a preview banner: every
 * figure on it invented, including the billing period. That is worse than no
 * screen, because it answers questions confidently and wrongly. The numbers
 * here are `usage_meter.total` — the same counter that refuses a customer's
 * booking — and the limits are resolved through the same capability stack
 * enforcement reads, never recomputed from the plan.
 *
 * **Read-only by design (BR-01).** There is no control here that changes what
 * a business may do. That decision belongs to the subscription's entitlements
 * panel, which resolves the value, audits the change and captures a reason. A
 * second door to the same decision is how two screens start disagreeing about
 * a customer's allowance.
 */
interface UsageMeterRow {
  usageType: string;
  label: string;
  unit: string;
  used: number;
  meterId: string | null;
  capabilityKey: string | null;
  /** Null means uncapped — never rendered as a limit of zero (AC-06). */
  limit: number | null;
  /** Whether anything in the platform records this type yet (BR-03). */
  counted: boolean;
}

interface UsageRow {
  businessId: string;
  businessName: string;
  subscriptionId: string;
  subscriptionStatus: string;
  planCode: string;
  planName: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  meters: UsageMeterRow[];
  /** False when this business's configuration could not be read — limits unknown, not absent. */
  limitsResolved: boolean;
  /** The plan the LIMITS came from, which need not be the plan the subscription sells. */
  entitlementPlanCode: string | null;
  planMismatch: boolean;
}

interface UsagePage {
  rows: UsageRow[];
  total: number;
}

const COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.6fr' },
  { label: 'Plan', width: '1fr' },
  { label: 'Billing period', width: '1.2fr' },
  { label: 'Bookings', width: '0.9fr' },
  { label: 'Of limit', width: '1.3fr' },
];

const bookingsOf = (row: UsageRow) => row.meters.find((m) => m.usageType === 'booking');

export default function AdminUsagePage() {
  const { query } = useAdminSearch();
  const [paging, setPaging] = useState<PaginationState>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const [page, setPage] = useState<UsagePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const trimmedSearch = query.trim();
  const searchTooShort = trimmedSearch.length > 0 && trimmedSearch.length < 2;

  useEffect(() => {
    setPaging((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [trimmedSearch]);

  useEffect(() => {
    if (searchTooShort) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (trimmedSearch) params.set('search', trimmedSearch);
    params.set('page', '1');
    params.set('pageSize', String(paging.page * paging.pageSize));

    adminFetch<UsagePage>(`/usage?${params}`, { signal: controller.signal })
      .then(setPage)
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Never an empty state on a failed read — "no usage" is a claim about
        // customers, and this is a claim about the network.
        setError(err instanceof AdminApiError ? err.message : 'Could not load usage.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [trimmedSearch, searchTooShort, paging, reloadToken]);

  // Ordered by the server, by PROPORTION of limit rather than absolute volume
  // — the database can rank by volume but not by a fraction of a limit it does
  // not know. Not re-sorted here: two sort orders for one list is how a page
  // and its "next page" stop agreeing about what is on them.
  const rows = page?.rows ?? [];
  // Totals across what is LOADED, and labelled as such. "Across the 20
  // businesses shown" is true; "across the platform" would not be.
  const bookingsTotal = rows.reduce((sum, r) => sum + (bookingsOf(r)?.used ?? 0), 0);
  const atOrOverCap = rows.filter((r) => {
    const b = bookingsOf(r);
    return b && b.limit !== null && b.limit > 0 && b.used >= b.limit;
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <Stat label="Bookings counted" value={bookingsTotal.toLocaleString('en-IN')} sub={`across ${rows.length} business${rows.length === 1 ? '' : 'es'} shown`} />
        <Stat label="At or over their limit" value={String(atOrOverCap)} sub={atOrOverCap > 0 ? 'bookings are being refused' : 'nobody is capped out'} />
        {/* BR-03 — named as not yet counted, never rendered as a zero that
            reads like a fact about the customer's behaviour. */}
        <Stat label="WhatsApp messages" value="—" sub="not counted yet (Jira GRW-86)" muted />
        <Stat label="AI usage" value="—" sub="not counted yet (Jira GRW-91)" muted />
      </div>

      <Card>
        <SectionTitle title="Bookings used this billing period" />

        {/* The reconciliation note GRW-124's QA pass asked for. Three
            surfaces count a booking differently, all correctly, and an owner
            reading "83 this month" in their own dashboard next to "97 of 100"
            here will otherwise open a support ticket about it. */}
        <div
          style={{
            marginBottom: 14,
            padding: '11px 14px',
            borderRadius: 11,
            background: oklch.surfaceSubtle,
            border: `1px solid ${oklch.border}`,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: 'oklch(0.45 0.02 155)',
            fontWeight: 500,
          }}
        >
          One booking here is <strong>one visit</strong>, counted when it was confirmed, against the subscription&rsquo;s own billing period. A
          combo of three services is one. A booking later cancelled or marked a no-show is <strong>not</strong> deducted — the allowance was
          spent when it was taken. The owner&rsquo;s own reports exclude cancellations and use calendar months, so their number will be lower
          than this one. Both are right; they answer different questions.
        </div>

        {error ? (
          <div style={{ textAlign: 'center', padding: '28px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
            <SecondaryButton onClick={() => setReloadToken((t) => t + 1)}>Retry</SecondaryButton>
          </div>
        ) : searchTooShort ? (
          <EmptyState icon="usage" title="Keep typing" sub="Search needs at least two characters." />
        ) : loading && !page ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ height: 44, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="usage"
            title={trimmedSearch ? 'No businesses match' : 'No businesses are metered yet'}
            sub={trimmedSearch ? 'Try a different name.' : 'A business appears here once it has a subscription with a current billing period.'}
          />
        ) : (
          <>
            <Table
              columns={COLUMNS}
              minWidthPx={820}
              rows={rows.map((row) => {
                const bookings = bookingsOf(row);
                const used = bookings?.used ?? 0;
                const limit = bookings?.limit ?? null;
                return (
                  <TableRow key={row.subscriptionId} columns={COLUMNS}>
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`/admin/businesses/${row.businessId}`}
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: oklch.textStrong,
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'block',
                        }}
                      >
                        {row.businessName}
                      </Link>
                      {row.subscriptionStatus !== 'ACTIVE' ? (
                        <div style={{ marginTop: 3 }}>
                          <StatusPill status={subscriptionStatusLabel(row.subscriptionStatus)} />
                        </div>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 13, color: 'oklch(0.4 0.02 155)', fontWeight: 600 }}>
                      {row.planName ?? row.planCode}
                      {/* The subscription sells one plan and the limits come
                          from another (Jira GRW-147). Said on the row, because
                          a silent mismatch is how it stays unfound — the
                          customer is billed for one thing and limited by
                          another, and both this screen and the engine agree
                          on the wrong one. */}
                      {row.planMismatch ? (
                        <div
                          style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.52 0.13 65)', marginTop: 3 }}
                          title={`Limits are resolved from ${row.entitlementPlanCode}, not from the plan this subscription sells.`}
                        >
                          Limits from {row.entitlementPlanCode}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>
                      {formatDateOnly(row.currentPeriodStart)} – {formatDateOnly(row.currentPeriodEnd)}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'oklch(0.28 0.02 155)' }}>{used.toLocaleString('en-IN')}</div>
                    <LimitCell used={used} limit={limit} resolved={row.limitsResolved} />
                  </TableRow>
                );
              })}
            />
            <Pagination total={page?.total ?? 0} shown={rows.length} state={paging} onChange={setPaging} maxRows={100} />
          </>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, muted }: { label: string; value: string; sub: string; muted?: boolean }) {
  return (
    <Card>
      <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, color: muted ? 'oklch(0.6 0.02 155)' : oklch.textStrong, marginTop: 6, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: oklch.textFaint, marginTop: 7, fontWeight: 500 }}>{sub}</div>
    </Card>
  );
}

/**
 * Used against limit — with three genuinely different answers, not two.
 *
 * `limit === null` is uncapped, and must not render as a bar at 100% or as
 * "used / 0" (AC-06). `resolved === false` is a business whose configuration
 * could not be read: its limit is UNKNOWN, which is not the same as unlimited
 * and must not quietly look like it.
 */
function LimitCell({ used, limit, resolved }: { used: number; limit: number | null; resolved: boolean }) {
  if (!resolved) {
    return (
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.52 0.13 65)' }} title="This business's plan configuration could not be read.">
        Limit unknown
      </div>
    );
  }
  if (limit === null) {
    return <div style={{ fontSize: 12.5, fontWeight: 600, color: oklch.textFaint }}>No limit</div>;
  }
  if (limit === 0) {
    // A limit of zero is how a SUSPENDED or PAUSED subscription's restricted
    // ceiling blocks bookings entirely (GRW-120). `usageState` divides by the
    // limit and answers 0% for it, which would paint a green bar over a
    // business whose every booking is being refused — precisely inverted.
    return (
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.55 0.17 25)' }} title="This subscription's status blocks new bookings.">
        Blocked
      </div>
    );
  }

  const { pct, color } = usageState(used, limit);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 44, height: 7, borderRadius: 99, background: oklch.divider, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99 }} />
      </div>
      {/* The percentage is NOT clamped even though the bar is: a business
          over its limit — legitimate, when a limit is lowered after the
          bookings were taken — is the one row a support team needs to see. */}
      <span style={{ fontSize: 12, fontWeight: 700, color, width: 44, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}
