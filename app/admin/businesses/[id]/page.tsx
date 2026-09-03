'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../../lib/api';
import { formatDateOnly, formatDateTime } from '../../lib/format';
import { Icon, TypeIcon } from '../../icons';
import { AuditLogList } from '../../components/AuditLogList';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Card, EmptyState, PrimaryButton, SecondaryButton, SectionTitle, StatusPill, Table, TableRow, type TableColumn } from '../../components/primitives';
import { SubscriptionPanel } from '../../components/SubscriptionPanel';
import { subscriptionStatusLabel } from '../../lib/subscription-status';
import { inr, oklch, typeColor } from '../../tokens';

/**
 * GRW-102's business detail — the one screen support lives in. This story
 * builds the shell, the summary header, and the tabs whose data already
 * exists (Overview, Users, Branches, Bookings, Customers, Audit); every
 * other tab renders an honest "not built yet" state naming the epic that
 * fills it in, per this story's own BR-04 — never a zero, never a fake chart.
 */

interface BusinessDetail {
  tenantId: string;
  name: string;
  status: string;
  vertical: string;
  planCode: string;
  planName: string;
  planListPriceMinor: number;
  planCurrency: string;
  ownerEmail: string | null;
  branchCount: number;
  userCount: number;
  createdAt: string;
  timezone: string;
  waPhoneNumber: string | null;
  businessTypeVersion: number;
  locations: Array<{ id: string; name: string; active: boolean }>;
  members: Array<{ userId: string; email: string; role: string }>;
  suspensionReason: string | null;
  subscription: {
    id: string;
    status: string;
    finalPriceMinor: number;
    currency: string;
    currentPeriodEnd: string;
    nextBillingDate: string;
  } | null;
}

interface RecentBooking {
  id: string;
  serviceName: string;
  startAt: string;
  status: string;
}

interface DetailResponse {
  business: BusinessDetail;
  bookings: { total: number; recent: RecentBooking[] };
  customers: { total: number };
}

interface Me {
  permissions: string[];
}

interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  createdAt: string;
}

const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface TabDef {
  key: string;
  label: string;
  /** Beyond admin.business.view (already required to reach this page at all) — null means no extra permission. */
  permission: string | null;
}

/**
 * The tab registry this story's own Technical Note asks for — a tab
 * declares its label and permission here, once, so a later epic adds its
 * content without touching the shell. `whatsapp` and `usage` share
 * `admin.usage.view`: no dedicated WhatsApp-usage permission exists in
 * GRW-94's registry, and WhatsApp usage is a usage metric in the same
 * sense the summary header's "WhatsApp used/limit" field is.
 */
const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', permission: null },
  { key: 'subscription', label: 'Subscription', permission: 'admin.subscription.view' },
  { key: 'usage', label: 'Usage', permission: 'admin.usage.view' },
  { key: 'users', label: 'Users', permission: null },
  { key: 'branches', label: 'Branches', permission: null },
  { key: 'bookings', label: 'Bookings', permission: null },
  { key: 'customers', label: 'Customers', permission: null },
  { key: 'whatsapp', label: 'WhatsApp', permission: 'admin.usage.view' },
  { key: 'billing', label: 'Billing', permission: 'admin.invoice.view' },
  { key: 'audit', label: 'Audit', permission: 'admin.audit.view' },
];

export default function BusinessDetailPage() {
  return (
    <Suspense>
      <BusinessDetailInner />
    </Suspense>
  );
}

function BusinessDetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // GRW-103 — suspend/reactivate. `pendingAction` is which one the confirm
  // dialog is open for; null means closed. Success bumps retryToken, the
  // same "refresh this page's data" idiom the Retry button already uses,
  // rather than patching business.status in local state by hand.
  const [pendingAction, setPendingAction] = useState<'suspend' | 'reactivate' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);

    Promise.all([adminFetch<DetailResponse>(`/businesses/${params.id}`), adminFetch<Me>('/me')])
      .then(([detail, meResult]) => {
        if (cancelled) return;
        setData(detail);
        setMe(meResult);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AdminApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof AdminApiError ? err.message : 'Could not load this business.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id, retryToken]);

  // FR-01/Validations — an unrecognised or absent tab falls back to Overview
  // rather than rendering nothing; a tab the admin lacks permission for is
  // simply not offered (the endpoints behind it refuse independently).
  const visibleTabs = TABS.filter((t) => !t.permission || (me ? me.permissions.includes(t.permission) : false));
  const requestedTab = searchParams.get('tab');
  const activeTab = visibleTabs.find((t) => t.key === requestedTab)?.key ?? 'overview';

  function setTab(key: string) {
    router.push(`/admin/businesses/${params.id}?tab=${key}`);
  }

  const canManage = me?.permissions.includes('admin.business.manage') ?? false;

  function submitAction(reason: string) {
    if (!pendingAction) return;
    setActionLoading(true);
    setActionError(null);
    adminFetch(`/businesses/${params.id}/${pendingAction}`, { method: 'POST', body: JSON.stringify({ reason }) })
      .then(() => {
        setPendingAction(null);
        setRetryToken((n) => n + 1);
      })
      .catch((err) => {
        setActionError(err instanceof AdminApiError ? err.message : `Could not ${pendingAction} this business.`);
      })
      .finally(() => setActionLoading(false));
  }

  // AC-02 — an unknown business id never renders a tab shell around empty data.
  if (notFound) {
    return (
      <EmptyState
        icon="businesses"
        title="Business not found"
        sub={`No business with id ${params.id}. It may have been removed, or the link is out of date.`}
      />
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
          <SecondaryButton onClick={() => setRetryToken((n) => n + 1)}>
            Retry
          </SecondaryButton>
        </div>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <Card>
        <div style={{ height: 160, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
      </Card>
    );
  }

  const { business, bookings, customers } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SummaryHeader business={business} canManage={canManage} onRequestAction={setPendingAction} />

      {business.status === 'suspended' ? <SuspendedBanner reason={business.suspensionReason} /> : null}

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === 'suspend' ? `Suspend ${business.name}?` : `Reactivate ${business.name}?`}
        description={
          pendingAction === 'suspend'
            ? 'Its dashboard users will not be able to sign in and no proactive WhatsApp messages will be sent on its behalf. Its bookings, customers, services and WhatsApp number are untouched — this can be reversed at any time.'
            : 'Dashboard sign-in and proactive WhatsApp messages resume immediately. Nothing else about the business changes.'
        }
        confirmLabel={pendingAction === 'suspend' ? 'Suspend business' : 'Reactivate business'}
        danger={pendingAction === 'suspend'}
        reasonRequired
        reasonPlaceholder={pendingAction === 'suspend' ? 'Why is this business being suspended?' : 'Why is this business being reactivated?'}
        loading={actionLoading}
        error={actionError}
        onConfirm={submitAction}
        onCancel={() => {
          setPendingAction(null);
          setActionError(null);
        }}
      />

      <div
        className="admin-table-scroll"
        style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${oklch.divider}` }}
      >
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px',
              fontSize: 13.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              flex: 'none',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.key ? `2px solid ${oklch.accent}` : '2px solid transparent',
              color: activeTab === t.key ? oklch.accentText : oklch.textMuted,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? <OverviewTab business={business} /> : null}
      {activeTab === 'users' ? <UsersTab members={business.members} /> : null}
      {activeTab === 'branches' ? <BranchesTab locations={business.locations} /> : null}
      {activeTab === 'bookings' ? <BookingsTab bookings={bookings} timezone={business.timezone} /> : null}
      {activeTab === 'customers' ? <CustomersTab total={customers.total} /> : null}
      {activeTab === 'audit' ? <AuditLogList fixedTenantId={business.tenantId} /> : null}
      {activeTab === 'subscription' ? (
        business.subscription ? (
          <SubscriptionPanel
            subscriptionId={business.subscription.id}
            canManage={me?.permissions.includes('admin.subscription.manage') ?? false}
            businessName={business.name}
            planName={business.planName}
            // Cancelling here changes the status this page's own summary
            // header shows, so refetch rather than let two parts of one
            // screen disagree about it.
            onChanged={() => setRetryToken((t) => t + 1)}
          />
        ) : (
          <EmptyState
            icon="subs"
            title="No open subscription"
            sub="This business is not being charged. A cancelled or expired subscription is not shown here — its history lives in the audit log."
          />
        )
      ) : null}
      {activeTab === 'usage' ? <NotYetBuiltTab what="Usage tracking against the plan's limits" epic="GRW-85" /> : null}
      {activeTab === 'whatsapp' ? <NotYetBuiltTab what="WhatsApp message usage, by category" epic="GRW-86" /> : null}
      {activeTab === 'billing' ? <NotYetBuiltTab what="Invoices and payment history" epic="GRW-83" /> : null}
    </div>
  );
}

function SummaryHeader({
  business,
  canManage,
  onRequestAction,
}: {
  business: BusinessDetail;
  canManage: boolean;
  onRequestAction: (action: 'suspend' | 'reactivate') => void;
}) {
  const tc = typeColor(business.vertical);
  // BR-03 — only active<->suspended is this story's transition; a business
  // that is provisioning or churned offers neither button rather than one
  // that would just come back 409.
  const canSuspend = canManage && business.status === 'active';
  const canReactivate = canManage && business.status === 'suspended';

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span
          style={{
            width: 54,
            height: 54,
            borderRadius: 15,
            background: tc.bg,
            color: tc.fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <TypeIcon type={business.vertical} size={26} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: oklch.textStrong }}>{business.name}</div>
          <div style={{ fontSize: 13, color: oklch.textMuted }}>
            {business.vertical} · {business.ownerEmail ?? 'No owner recorded'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusPill status={statusLabel(business.status)} />
          {canSuspend ? (
            <SecondaryButton danger onClick={() => onRequestAction('suspend')}>
              Suspend
            </SecondaryButton>
          ) : null}
          {canReactivate ? (
            <PrimaryButton onClick={() => onRequestAction('reactivate')}>Reactivate</PrimaryButton>
          ) : null}
        </div>
      </div>

      {/* BR-01/AC-01: list price and customer price always render together —
          today neither exists (no subscription/pricing epic has shipped),
          so both show the same honest placeholder rather than one being
          silently omitted. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 16,
          marginTop: 20,
          paddingTop: 20,
          borderTop: `1px solid ${oklch.divider}`,
        }}
      >
        <SummaryField label="Plan" value={business.planName} />
        <SummaryField label="List price" value={`${inr(business.planListPriceMinor / 100)}/mo`} />
        {/* Real since GRW-105/GRW-109. These four used to read "isn't tracked
            yet" and, worse, "No subscription yet" as a flat assertion about a
            business that had one — an unknown rendered as a definite negative
            on the screen support opens during a billing call. A business with
            no OPEN subscription still shows "None", which is a fact, with the
            reason it might be absent in the hint. */}
        <SummaryField
          label="Customer price"
          value={business.subscription ? `${inr(business.subscription.finalPriceMinor / 100)}/mo` : '—'}
          hint={business.subscription ? undefined : 'No open subscription, so nothing is being charged.'}
        />
        <SummaryField
          label="Subscription"
          // The raw enum leaked to the screen here — an admin should never
          // read PAYMENT_FAILED. One translation, shared with the
          // subscription screens so both say the same words (GRW-112).
          value={business.subscription ? subscriptionStatusLabel(business.subscription.status) : 'None'}
          hint={business.subscription ? undefined : 'This business has no open subscription.'}
        />
        <SummaryField
          label="Next billing"
          value={business.subscription ? formatDateOnly(business.subscription.nextBillingDate) : '—'}
          hint={business.subscription ? undefined : 'No open subscription to bill.'}
        />
        <SummaryField label="Bookings" value="—" hint="No monthly booking limit is tracked yet — see the Bookings tab for the real total." />
        <SummaryField label="WhatsApp" value="—" hint="WhatsApp usage isn't metered yet (Jira GRW-86)." />
        <SummaryField label="Branches" value={String(business.branchCount)} />
        <SummaryField label="Users" value={String(business.userCount)} />
        <SummaryField label="Created" value={formatDateTime(business.createdAt)} />
      </div>
    </Card>
  );
}

function SummaryField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <div style={{ fontSize: 11, fontWeight: 800, color: oklch.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: value === '—' ? oklch.textFaint : oklch.textStrong,
          marginTop: 3,
          cursor: hint ? 'help' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** GRW-103 FR-05 — the suspended state and its reason, visible wherever this business's detail renders, not just in the audit trail. */
function SuspendedBanner({ reason }: { reason: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 18px',
        borderRadius: 14,
        background: oklch.dangerBg,
        border: `1px solid ${oklch.danger}`,
      }}
    >
      <span style={{ color: oklch.danger, flex: 'none', marginTop: 1 }}>
        <Icon name="alert" size={18} />
      </span>
      <div style={{ fontSize: 13.5, color: oklch.textStrong, lineHeight: 1.5 }}>
        <strong>This business is suspended.</strong> Its dashboard users cannot sign in and no proactive WhatsApp
        messages are sent on its behalf. Its data is untouched.
        {reason ? (
          <span style={{ display: 'block', marginTop: 4, color: oklch.textMuted }}>Reason: {reason}</span>
        ) : null}
      </div>
    </div>
  );
}

function OverviewTab({ business }: { business: BusinessDetail }) {
  const [activity, setActivity] = useState<AuditRow[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ rows: AuditRow[] }>(`/audit?tenantId=${business.tenantId}&pageSize=5`)
      .then((r) => {
        if (!cancelled) setActivity(r.rows);
      })
      .catch((err) => {
        if (!cancelled) setActivityError(err instanceof AdminApiError ? err.message : 'Could not load recent activity.');
      });
    return () => {
      cancelled = true;
    };
  }, [business.tenantId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SectionTitle title="Identity" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 12 }}>
          <SummaryField label="Business ID" value={business.tenantId} />
          <SummaryField label="Vertical" value={`${business.vertical} · v${business.businessTypeVersion}`} />
          <SummaryField label="Timezone" value={business.timezone} />
          <SummaryField label="WhatsApp number" value={business.waPhoneNumber ?? '—'} />
          <SummaryField label="Owner" value={business.ownerEmail ?? '—'} />
        </div>
      </Card>

      <Card>
        <SectionTitle
          title="Recent activity"
          right={
            <Link href={`/admin/businesses/${business.tenantId}?tab=audit`} style={{ fontSize: 12.5, fontWeight: 700 }}>
              View all
            </Link>
          }
        />
        {activityError ? (
          <div style={{ fontSize: 13, color: oklch.textFaint, marginTop: 10 }}>{activityError}</div>
        ) : !activity ? (
          <div style={{ height: 60, borderRadius: 10, background: oklch.divider, marginTop: 10, animation: 'admin-fade 1.2s ease infinite alternate' }} />
        ) : activity.length === 0 ? (
          <div style={{ fontSize: 13, color: oklch.textFaint, marginTop: 10 }}>No activity recorded for this business yet.</div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {activity.map((row, i) => (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: i < activity.length - 1 ? `1px solid ${oklch.divider}` : 'none',
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 700, color: oklch.textStrong }}>{row.action}</span>
                <span style={{ color: oklch.textFaint }}>{formatDateTime(row.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const USERS_COLUMNS: TableColumn[] = [
  { label: 'Email', width: '2fr' },
  { label: 'Role', width: '1fr' },
];

function UsersTab({ members }: { members: BusinessDetail['members'] }) {
  if (members.length === 0) {
    return <EmptyState icon="users" title="No users yet" sub="Nobody has been added to this business's dashboard." />;
  }
  return (
    <Table
      columns={USERS_COLUMNS}
      minWidthPx={420}
      rows={members.map((m) => (
        <TableRow key={m.userId} columns={USERS_COLUMNS}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: oklch.text }}>{m.email}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: oklch.textMuted, textTransform: 'capitalize' }}>{m.role}</div>
        </TableRow>
      ))}
    />
  );
}

const BRANCHES_COLUMNS: TableColumn[] = [
  { label: 'Branch', width: '2fr' },
  { label: 'Status', width: '1fr' },
];

function BranchesTab({ locations }: { locations: BusinessDetail['locations'] }) {
  if (locations.length === 0) {
    return <EmptyState icon="businesses" title="No branches yet" sub="This business has no locations set up." />;
  }
  return (
    <Table
      columns={BRANCHES_COLUMNS}
      minWidthPx={420}
      rows={locations.map((l) => (
        <TableRow key={l.id} columns={BRANCHES_COLUMNS}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: oklch.text }}>{l.name}</div>
          <div>
            <StatusPill status={l.active ? 'Active' : 'Suspended'} />
          </div>
        </TableRow>
      ))}
    />
  );
}

const BOOKINGS_COLUMNS: TableColumn[] = [
  { label: 'Service', width: '2fr' },
  { label: 'When', width: '1.4fr' },
  { label: 'Status', width: '1fr' },
];

function BookingsTab({ bookings, timezone }: { bookings: { total: number; recent: RecentBooking[] }; timezone: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SummaryField label="Total bookings" value={String(bookings.total)} />
      </Card>
      {bookings.recent.length === 0 ? (
        <EmptyState icon="businesses" title="No bookings yet" sub="This business has no appointments on record." />
      ) : (
        <Table
          columns={BOOKINGS_COLUMNS}
          minWidthPx={480}
          rows={bookings.recent.map((b) => (
            <TableRow key={b.id} columns={BOOKINGS_COLUMNS}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: oklch.text }}>{b.serviceName}</div>
              <div style={{ fontSize: 13, color: oklch.textMuted }}>{formatDateTime(b.startAt, timezone)}</div>
              <div>
                <StatusPill status={statusLabel(b.status).replace('_', ' ')} />
              </div>
            </TableRow>
          ))}
        />
      )}
    </div>
  );
}

function CustomersTab({ total }: { total: number }) {
  return (
    <Card>
      <SummaryField label="Total customers" value={String(total)} />
      <p style={{ fontSize: 13, color: oklch.textFaint, marginTop: 16, lineHeight: 1.6 }}>
        Individual customer records don't appear on this screen. Support reads a business's shape here, not the salon's
        own customer list — a customer's name and WhatsApp number are that business's data, not Growza's, and stay off
        cross-tenant admin surfaces (see <code>06-security.md</code>'s admin read boundary).
      </p>
    </Card>
  );
}

function NotYetBuiltTab({ what, epic }: { what: string; epic: string }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '8px 4px' }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: 'oklch(0.96 0.05 80)',
            color: 'oklch(0.52 0.13 65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <Icon name="alert" size={18} />
        </span>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: oklch.textStrong }}>Not built yet</div>
          <div style={{ fontSize: 13, color: oklch.textMuted, marginTop: 4, lineHeight: 1.5 }}>
            {what} will appear here once <strong>Jira {epic}</strong> ships. Nothing is hidden — this tab genuinely has
            no data source yet, so it says so rather than showing a zero.
          </div>
        </div>
      </div>
    </Card>
  );
}
