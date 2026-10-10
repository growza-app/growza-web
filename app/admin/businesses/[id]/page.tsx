'use client';

import { BranchBillPreview } from '../../components/BranchBillPreview';
import { BranchRowActions } from '../../components/BranchRowActions';
import { BranchPlaces } from '../../components/BranchPlaces';
import { stylistsProblem } from '../../lib/enrol-validation';
import { GEO_PROBLEM, pinFromText } from '../../lib/geo-link';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../../lib/api';
import { formatDateOnly, formatDateTime } from '../../lib/format';
import { Icon, TypeIcon } from '../../icons';
import { AuditLogList } from '../../components/AuditLogList';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Card, EmptyState, PrimaryButton, SecondaryButton, SectionTitle, Select, StatusPill, Table, TableRow, TextInput, type TableColumn } from '../../components/primitives';
import { SubscriptionPanel } from '../../components/SubscriptionPanel';
import { GoLiveChecklist, type ReadinessItem } from '../../components/GoLiveChecklist';
import { BillingTab } from '../../components/BillingTab';
import { PaymentsCard, type BusinessPayments } from '../../components/PaymentsCard';
import { subscriptionStatusLabel } from '../../lib/subscription-status';
import { inr, oklch, typeColor } from '../../tokens';
import { useAdminMe } from '../../components/AdminMeContext';

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
  ownerPhone: string | null;
  branchCount: number;
  userCount: number;
  createdAt: string;
  timezone: string;
  waPhoneNumber: string | null;
  businessTypeVersion: number;
  // Jira GRW-236 — main branch first; `isMain` marks it.
  locations: Array<{
    id: string;
    name: string;
    active: boolean;
    isMain: boolean;
    /** Jira GRW-563 — the attendance pin, null until somebody sets it. */
    geoLat?: number | null;
    geoLng?: number | null;
    /** Jira GRW-557 — the branch's own number of stylists; null while it uses the plan's. */
    maxProviders: number | null;
    activeStylists: number;
  }>;
  /** Jira GRW-557 — the plan's number of stylists per branch; null when it could not be resolved. */
  placesDefault?: number | null;
  members: Array<{ userId: string; phone: string | null; role: string }>;
  suspensionReason: string | null;
  subscription: {
    id: string;
    status: string;
    finalPriceMinor: number;
    /** Jira GRW-161 — the next bill with its branches. */
    nextBillMinor?: number;
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
  /** GRW-176 — present only while the business is `provisioning`. */
  readiness: { ready: boolean; items: ReadinessItem[] } | null;
  /** Jira GRW-556 (follow-up) — online payment for this business. Absent from an older API. */
  payments?: BusinessPayments;
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
  const { me, can } = useAdminMe();
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

  // GRW-137 — impersonation. Its own dialog rather than a third value in
  // `pendingAction`: it is not a state transition on the business, its confirm
  // copy is unlike the other two, and success navigates away instead of
  // refreshing this page.
  // GRW-176 — going live. Its own dialog for the same reason impersonation has
  // one: it is not suspend/reactivate's transition, and its confirm copy is
  // about a decision rather than a reversal.
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [goLiveBusy, setGoLiveBusy] = useState(false);
  const [goLiveError, setGoLiveError] = useState<string | null>(null);
  /** Jira GRW-556 (follow-up) — set when going live landed the business suspended; shown above the banner that explains why. */
  const [goLiveNotice, setGoLiveNotice] = useState<string | null>(null);

  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);

    // Batch D — permissions come from the shared /me (`useAdminMe`), not a second read with every page load.
    adminFetch<DetailResponse>(`/businesses/${params.id}`)
      .then((detail) => {
        if (cancelled) return;
        setData(detail);
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
  const canImpersonate = me?.permissions.includes('admin.impersonation.start') ?? false;

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

  function goLive(reason: string) {
    setGoLiveBusy(true);
    setGoLiveError(null);
    adminFetch<{ status?: string; suspendedForNonPayment?: boolean }>(`/businesses/${params.id}/activate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
      .then((res) => {
        setGoLiveOpen(false);
        // Jira GRW-556 (follow-up) — it went live and was suspended in the same breath, because its subscription is
        // already unpaid. Said here, or the page reloads showing "suspended" with no clue why.
        setGoLiveNotice(
          res?.suspendedForNonPayment
            ? 'Taken live — but its subscription is already suspended for non-payment, so it is read-only until the bill is paid.'
            : null,
        );
        setRetryToken((n) => n + 1);
      })
      .catch((err) => {
        // A 422 here means the checklist changed under the admin between the
        // page loading and them clicking — the server's message names what is
        // missing, so it is shown rather than replaced with a generic line.
        setGoLiveError(err instanceof AdminApiError ? err.message : 'Could not take this business live.');
      })
      .finally(() => setGoLiveBusy(false));
  }

  function startImpersonation(reason: string) {
    setImpersonateLoading(true);
    setImpersonateError(null);
    adminFetch(`/businesses/${params.id}/impersonate`, { method: 'POST', body: JSON.stringify({ reason }) })
      .then(() => {
        /**
         * A full page load to the salon's dashboard.
         *
         * The response set the session cookie (GRW-137), so this navigation
         * arrives already authenticated as the owner. `assign` and not a
         * router push: this crosses into the tenant app's own root layout, and
         * nothing rendered as an admin should survive the trip.
         */
        window.location.assign('/');
      })
      .catch((err) => {
        setImpersonateError(err instanceof AdminApiError ? err.message : 'Could not start the session.');
        setImpersonateLoading(false);
      });
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

  const { business, bookings, customers, readiness, payments } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SummaryHeader
        business={business}
        canManage={canManage}
        canImpersonate={canImpersonate}
        onRequestAction={setPendingAction}
        onRequestImpersonate={() => {
          setImpersonateError(null);
          setImpersonateOpen(true);
        }}
      />

      <ConfirmDialog
        open={impersonateOpen}
        title={`View ${business.name} as its owner?`}
        description={`You will see the dashboard exactly as ${business.ownerPhone ?? 'the owner'} does, and you will not be able to change anything. The session is logged with your name and this reason, and ends after 30 minutes or when you exit.`}
        confirmLabel={impersonateLoading ? 'Starting…' : 'Start session'}
        reasonRequired
        reasonMinLength={10}
        reasonPlaceholder="What are you looking into?"
        loading={impersonateLoading}
        error={impersonateError}
        onConfirm={startImpersonation}
        onCancel={() => setImpersonateOpen(false)}
      />

      {goLiveNotice ? <div role="status" style={{ fontSize: 13.5, color: oklch.textStrong }}>{goLiveNotice}</div> : null}
      {business.status === 'suspended' ? <SuspendedBanner reason={business.suspensionReason} /> : null}

      {readiness ? (
        <GoLiveChecklist
          items={readiness.items}
          ready={readiness.ready}
          canManage={canManage}
          busy={goLiveBusy}
          onGoLive={() => setGoLiveOpen(true)}
        />
      ) : null}

      {payments ? (
        <PaymentsCard
          businessId={params.id}
          businessName={business.name}
          payments={payments}
          canManage={me?.permissions.includes('admin.feature_flag.manage') ?? false}
          onChanged={() => setRetryToken((n) => n + 1)}
        />
      ) : null}

      <ConfirmDialog
        open={goLiveOpen}
        title={`Take ${business.name} live?`}
        description="It will be able to take bookings immediately, and its first invoice follows its billing period as normal. This cannot be undone from here — a business that must stop trading is suspended instead."
        confirmLabel={goLiveBusy ? 'Going live…' : 'Go live'}
        reasonRequired
        reasonPlaceholder="Why is this business going live now?"
        loading={goLiveBusy}
        error={goLiveError}
        onConfirm={goLive}
        onCancel={() => setGoLiveOpen(false)}
      />

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === 'suspend' ? `Suspend ${business.name}?` : `Reactivate ${business.name}?`}
        description={
          pendingAction === 'suspend'
            ? 'Its dashboard users can still sign in and look at everything, but cannot change anything except pay the bill, and no proactive WhatsApp messages will be sent on its behalf. Its bookings, customers, services and WhatsApp number are untouched — this can be reversed at any time.'
            : 'Its dashboard users can change things again and proactive WhatsApp messages resume immediately. Nothing else about the business changes.'
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
      {activeTab === 'branches' ? (
        <BranchesTab
          businessId={params.id}
          businessName={business.name}
          locations={business.locations}
          placesDefault={business.placesDefault ?? null}
          canManage={canManage}
          onChanged={() => setRetryToken((n) => n + 1)}
        />
      ) : null}
      {activeTab === 'bookings' ? <BookingsTab bookings={bookings} timezone={business.timezone} /> : null}
      {activeTab === 'customers' ? <CustomersTab total={customers.total} /> : null}
      {activeTab === 'audit' ? <AuditLogList fixedTenantId={business.tenantId} /> : null}
      {activeTab === 'subscription' ? (
        business.subscription ? (
          <SubscriptionPanel
            subscriptionId={business.subscription.id}
            canManage={me?.permissions.includes('admin.subscription.manage') ?? false}
            canRecordPayment={me?.permissions.includes('admin.payment.record') ?? false}
            canDiscount={me?.permissions.includes('admin.discount.manage') ?? false}
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
      {/* GRW-119 — replaces GRW-102's placeholder. The same components the
          standalone Invoices and Payments screens use, so this business's
          figures cannot render differently here than they do there. */}
      {activeTab === 'billing' ? <BillingTab businessId={params.id} businessName={business.name} /> : null}
    </div>
  );
}

function SummaryHeader({
  business,
  canManage,
  canImpersonate,
  onRequestAction,
  onRequestImpersonate,
}: {
  business: BusinessDetail;
  canManage: boolean;
  canImpersonate: boolean;
  onRequestAction: (action: 'suspend' | 'reactivate') => void;
  onRequestImpersonate: () => void;
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
          {/* Jira GRW-288 — a 118-character name with a long unbroken run
              scrolled the page 9px sideways at 320px: the word was wider
              than the card, and nothing let it break. */}
          <div className="admin-name" style={{ fontSize: 19, fontWeight: 800, color: oklch.textStrong }}>
            {business.name}
          </div>
          <div style={{ fontSize: 13, color: oklch.textMuted }}>
            {business.vertical} · {business.ownerPhone ?? 'No owner recorded'}
          </div>
        </div>
        {/*
          `flexWrap` because these three do not fit a 320px phone.
          An ACTIVE business shows the status pill, Suspend and Impersonate
          owner side by side — 283px of controls in a 320px viewport once the
          card's padding is taken — which pushed a horizontal scrollbar onto the
          DOCUMENT and dragged the tab strip out with it. The tab strip was
          fine: it already scrolls inside its own `admin-table-scroll`
          container, which is the rule this row was quietly breaking.

          Only an active business hit it, which is why it survived: a
          provisioning or suspended one shows two controls and fits.
        */}
        <div className="admin-bar-end" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <StatusPill status={statusLabel(business.status)} />
          {canSuspend ? (
            <SecondaryButton danger onClick={() => onRequestAction('suspend')}>
              Suspend
            </SecondaryButton>
          ) : null}
          {canReactivate ? (
            <PrimaryButton onClick={() => onRequestAction('reactivate')}>Reactivate</PrimaryButton>
          ) : null}
          {/* Jira GRW-90 · GRW-137 — AC-04/BR-05: offered only to an admin who
              holds the permission. The endpoint refuses independently
              (GRW-136 AC-02); this is about not offering what will not work.
              Absent with no owner too — there would be nobody to be. */}
          {canImpersonate && business.ownerPhone ? (
            <SecondaryButton onClick={onRequestImpersonate}>Impersonate owner</SecondaryButton>
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(130px, 100%), 1fr))',
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
          // Jira GRW-161 — the next bill with its branches, when the API sends it.
          value={business.subscription ? `${inr((business.subscription.nextBillMinor ?? business.subscription.finalPriceMinor) / 100)}/mo` : '—'}
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
        <SummaryField
          label="Bookings"
          value="—"
          hint="Enforced since GRW-125 — a booking past the plan's cap is refused. The used/limit number isn't on this screen yet (GRW-126). The Bookings tab counts appointment rows all-time, which is not what the cap measures — don't use it to explain a refusal."
        />
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
        <strong>This business is suspended.</strong> Its dashboard users can sign in and look at everything, but cannot
        change anything except pay the bill, and no proactive WhatsApp messages are sent on its behalf. Its data is
        untouched.
        {reason ? (
          <span style={{ display: 'block', marginTop: 4, color: oklch.textMuted }}>Reason: {reason}</span>
        ) : (
          // Jira GRW-556 (follow-up) — no reason is what a billing suspension looks like (an admin's hold requires one).
          <span style={{ display: 'block', marginTop: 4, color: oklch.textMuted }}>
            Suspended automatically for non-payment. It lifts by itself when the bill is paid.
          </span>
        )}
      </div>
    </div>
  );
}

function OverviewTab({ business }: { business: BusinessDetail }) {
  const [activity, setActivity] = useState<AuditRow[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  // Batch D — Recent activity reads `/audit`, which needs `admin.audit.view`; the Overview tab needs nothing. Without
  // this an admin who could see the business got a permission error in the card, and "View all" led to a tab hidden
  // from them, which fell back to Overview.
  const canAudit = useAdminMe().can('admin.audit.view');

  useEffect(() => {
    if (!canAudit) return;
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
  }, [business.tenantId, canAudit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SectionTitle title="Identity" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 16, marginTop: 12 }}>
          <SummaryField label="Business ID" value={business.tenantId} />
          <SummaryField label="Vertical" value={`${business.vertical} · v${business.businessTypeVersion}`} />
          <SummaryField label="Timezone" value={business.timezone} />
          <SummaryField label="WhatsApp number" value={business.waPhoneNumber ?? '—'} />
          <SummaryField label="Owner" value={business.ownerPhone ?? '—'} />
        </div>
      </Card>

      {canAudit ? (
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
      ) : null}
    </div>
  );
}

const USERS_COLUMNS: TableColumn[] = [
  { label: 'Phone', width: '2fr' },
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
          <div style={{ fontSize: 13.5, fontWeight: 600, color: oklch.text }}>{m.phone ?? '—'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: oklch.textMuted, textTransform: 'capitalize' }}>{m.role}</div>
        </TableRow>
      ))}
    />
  );
}

const BRANCHES_COLUMNS: TableColumn[] = [
  { label: 'Branch', width: '2fr' },
  { label: 'Status', width: '1fr' },
  // Jira GRW-557 — active stylists against the branch's own number.
  { label: 'Stylists', width: '1.4fr' },
  { label: '', width: '1.6fr' },
];

/**
 * Jira GRW-236 — support adds a branch after enrolment, or closes one.
 *
 * The tenant app has told owners "contact Growza support to add or close a
 * branch" since GRW-227; this is the other end of that sentence. Both actions
 * are audited with a reason. A close the server refuses (the main branch, or a
 * branch with staff or upcoming bookings) shows the server's own words, which
 * name how many of each are still there.
 */
function BranchesTab({
  businessId,
  businessName,
  locations,
  placesDefault,
  canManage,
  onChanged,
}: {
  businessId: string;
  businessName: string;
  locations: BusinessDetail['locations'];
  placesDefault: number | null;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  /** Jira GRW-557 — how many stylists the new branch may have; starts at the plan's number each time it opens. */
  const [stylists, setStylists] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  /** Jira GRW-563 — a maps link or "lat, lng"; optional. */
  const [geo, setGeo] = useState('');
  /**
   * Jira GRW-384 — how the new branch's menu starts: a copy of an open branch's (the main one first), the
   * vertical's ready-made catalogue, or empty. "copy:<branch id>", "catalogue" or "empty".
   */
  const openBranches = locations.filter((l) => l.active).sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const [menu, setMenu] = useState<string>(() => (openBranches[0] ? `copy:${openBranches[0].id}` : 'catalogue'));
  const [closing, setClosing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCount = locations.filter((l) => l.active).length;

  function add(reason: string) {
    if (name.trim().length < 2) {
      setError('A branch name of at least 2 characters is needed.');
      return;
    }
    const stylistsError = stylistsProblem(stylists);
    if (stylistsError) {
      setError(stylistsError);
      return;
    }
    if (geo.trim() && !pinFromText(geo)) {
      setError(GEO_PROBLEM);
      return;
    }
    setBusy(true);
    setError(null);
    adminFetch(`/businesses/${businessId}/branches`, {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        address: { line1: line1.trim(), city: city.trim() },
        reason,
        maxProviders: Number(stylists.trim()),
        ...(geo.trim() ? { geoLink: geo.trim() } : {}),
        ...(menu.startsWith('copy:') ? { menu: 'copy', copyFrom: menu.slice(5) } : { menu }),
      }),
    })
      .then(() => {
        setAdding(false);
        setName('');
        setLine1('');
        setCity('');
        setGeo('');
        onChanged();
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not add the branch.'))
      .finally(() => setBusy(false));
  }

  function close(reason: string) {
    if (!closing) return;
    setBusy(true);
    setError(null);
    adminFetch(`/businesses/${businessId}/branches/${closing.id}/close`, { method: 'POST', body: JSON.stringify({ reason }) })
      .then(() => {
        setClosing(null);
        onChanged();
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not close the branch.'))
      .finally(() => setBusy(false));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {canManage ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <PrimaryButton
            onClick={() => {
              setError(null);
              setStylists(placesDefault === null ? '' : String(placesDefault));
              setAdding(true);
            }}
            disabled={openCount >= 20}
            title={openCount >= 20 ? 'A business can have at most 20 open branches' : undefined}
          >
            Add branch
          </PrimaryButton>
        </div>
      ) : null}

      {locations.length === 0 ? (
        <EmptyState icon="businesses" title="No branches yet" sub="This business has no locations set up." />
      ) : (
        <Table
          columns={BRANCHES_COLUMNS}
          minWidthPx={480}
          rows={locations.map((l) => (
            <TableRow key={l.id} columns={BRANCHES_COLUMNS}>
              <div className="admin-name" style={{ fontSize: 13.5, fontWeight: 600, color: oklch.text }}>
                {l.name}
                {l.isMain ? (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: oklch.textMuted }}>MAIN</span>
                ) : null}
                {/* Jira GRW-563 — whether the branch has a pin for phone check-in. */}
                <div style={{ fontSize: 11.5, fontWeight: 500, color: oklch.textMuted, marginTop: 2 }}>
                  {l.geoLat != null && l.geoLng != null ? `Pin ${l.geoLat.toFixed(4)}, ${l.geoLng.toFixed(4)}` : 'No pin yet'}
                </div>
              </div>
              <div>
                <StatusPill status={l.active ? 'Active' : 'Closed'} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <BranchPlaces businessId={businessId} branch={l} placesDefault={placesDefault} canManage={canManage} onChanged={onChanged} />
              </div>
              <div style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {/* Jira GRW-246 — Reopen on a closed branch, Make main on an open one. */}
                {canManage ? <BranchRowActions businessId={businessId} branch={l} onChanged={onChanged} /> : null}
                {canManage && l.active && !l.isMain ? (
                  <SecondaryButton
                    danger
                    onClick={() => {
                      setError(null);
                      setClosing({ id: l.id, name: l.name });
                    }}
                  >
                    Close
                  </SecondaryButton>
                ) : null}
              </div>
            </TableRow>
          ))}
        />
      )}

      <ConfirmDialog
        open={adding}
        title={`Add a branch to ${businessName}`}
        description="It is added after the existing branches. The owner can change its address and hours in Settings once it exists."
        confirmLabel={busy ? 'Adding…' : 'Add branch'}
        reasonRequired
        reasonPlaceholder="Why is this branch being added?"
        loading={busy}
        error={error}
        onConfirm={add}
        onCancel={() => setAdding(false)}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <label htmlFor="add-branch-name" style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted }}>
            Branch name
          </label>
          <TextInput id="add-branch-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Koramangala" />
          <label htmlFor="add-branch-line1" style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted }}>
            Address (optional)
          </label>
          <TextInput id="add-branch-line1" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="80 Feet Road" />
          <label htmlFor="add-branch-city" style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted }}>
            City (optional)
          </label>
          <TextInput id="add-branch-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
          <label htmlFor="add-branch-geo" style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted }}>
            Location (optional)
          </label>
          <TextInput id="add-branch-geo" value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="https://maps.google.com/… or 12.9716, 77.5946" />
          <span style={{ fontSize: 12.5, color: oklch.textMuted }}>
            A Google or Apple Maps link, or lat, lng. Pre-fills the owner&rsquo;s Phone check-in setting; they switch it on.
          </span>
          <label htmlFor="add-branch-stylists" style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted }}>
            Stylists at most
          </label>
          <TextInput
            id="add-branch-stylists"
            value={stylists}
            inputMode="numeric"
            onChange={(e) => setStylists(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={placesDefault === null ? '5' : String(placesDefault)}
          />
          <span style={{ fontSize: 12.5, color: oklch.textMuted }}>
            Starts at the plan&rsquo;s number: fewer for a small branch, more for a large one. Can be changed later.
          </span>
          <label htmlFor="add-branch-menu" style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted }}>
            Its menu
          </label>
          <Select
            id="add-branch-menu"
            value={menu}
            onChange={(e) => setMenu(e.target.value)}
            options={[
              ...openBranches.map((b) => ({ value: `copy:${b.id}`, label: `Copy ${b.name}’s services and prices` })),
              { value: 'catalogue', label: 'The ready-made catalogue for this kind of business' },
              { value: 'empty', label: 'Empty — the owner adds services later' },
            ]}
          />
          <span style={{ fontSize: 12.5, color: oklch.textMuted }}>
            A copy is the branch&rsquo;s own: prices can be changed there without touching the branch it came from.
          </span>
        </div>
        {/* Jira GRW-240 — the bill with this branch, before confirming. */}
        <BranchBillPreview businessId={businessId} change="add" open={adding} />
      </ConfirmDialog>

      <ConfirmDialog
        open={closing !== null}
        title={`Close ${closing?.name ?? 'this branch'}?`}
        description="It disappears from the owner's branches, booking sheet and Home. A branch with staff or upcoming bookings cannot be closed until they are moved. Its past bookings stay in Reports."
        confirmLabel={busy ? 'Closing…' : 'Close branch'}
        danger
        reasonRequired
        reasonPlaceholder="Why is this branch being closed?"
        loading={busy}
        error={error}
        onConfirm={close}
        onCancel={() => setClosing(null)}
      >
        <BranchBillPreview businessId={businessId} change="close" open={closing !== null} />
      </ConfirmDialog>
    </div>
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
